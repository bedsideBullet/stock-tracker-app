import express from "express";
import cors from "cors";
import { google } from "googleapis";
import dayjs from "dayjs";
import fetch from "node-fetch";
import nodemailer from "nodemailer";
import bodyParser from "body-parser";

// --- CONFIGURATION ---
const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];
const KEY_FILE = "service-account.json";
const SITE_URL = "sc-domain:pscmotorsports.com";

// Magento REST API credentials
const MAGENTO_API_URL = "https://pscmotorsports.com/rest/V1";
const MAGENTO_ADMIN_USERNAME = "admin"; // Replace with your admin username
const MAGENTO_ADMIN_PASSWORD = "admin123"; // Replace with your admin password
const MAGENTO_ADMIN_TOKEN = "YOUR_ADMIN_TOKEN_HERE"; // Generate this token (see below)

// Email sender config (uses SMTP, update for your setup if needed)
const EMAIL_FROM = "daniel.smith@pscmotorsports.com";
const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465;
const SMTP_USER = "daniel.smith@pscmotorsports.com";
const SMTP_PASS = "YOUR_APP_PASSWORD_OR_SMTP_PASSWORD"; // <-- REPLACE THIS

// --- SERVER SETUP ---
const app = express();
const PORT = 4000;
app.use(cors());
app.use(bodyParser.json());

// --- COMMON: Calculate previous full Sunday–Saturday week ---
function getLastFullWeekRange(today = dayjs()) {
	const dayOfWeek = today.day(); // 0=Sunday, 6=Saturday
	const lastSunday = today.startOf("day").subtract(dayOfWeek, "day");
	const prevSaturday = lastSunday.subtract(1, "day");
	const prevSunday = prevSaturday.subtract(6, "day");
	return {
		start: prevSunday.format("YYYY-MM-DD"),
		end: prevSaturday.format("YYYY-MM-DD"),
	};
}

// --- GOOGLE SEARCH CONSOLE ENDPOINT ---
app.get("/api/search-console-last-week", async (req, res) => {
	try {
		console.log("Initializing Google Search Console authentication...");
		const auth = new google.auth.GoogleAuth({
			keyFile: KEY_FILE,
			scopes: SCOPES,
		});
		const searchconsole = google.searchconsole({ version: "v1", auth });

		const { start, end } = getLastFullWeekRange();
		console.log(`Fetching Search Console data for ${start} to ${end}`);

		const response = await searchconsole.searchanalytics.query({
			siteUrl: SITE_URL,
			requestBody: {
				startDate: start,
				endDate: end,
				dimensions: [],
			},
		});

		const rows = response.data.rows || [];
		let clicks = 0,
			impressions = 0;
		if (rows.length) {
			clicks = rows[0].clicks || 0;
			impressions = rows[0].impressions || 0;
		}
		console.log(
			`Search Console data: clicks=${clicks}, impressions=${impressions}`
		);

		res.json({ clicks, impressions, startDate: start, endDate: end });
	} catch (e) {
		console.error("Error in Search Console fetch:", e.message, e.stack);
		res.status(500).json({ error: "Failed to fetch Search Console data" });
	}
});

// --- MAGENTO REPORT ENDPOINT ---
async function getMagentoAdminToken() {
	const tokenUrl = `${MAGENTO_API_URL}/integration/admin/token`;
	console.log("Requesting Magento admin token from:", tokenUrl);
	const response = await fetch(tokenUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			username: MAGENTO_ADMIN_USERNAME,
			password: MAGENTO_ADMIN_PASSWORD,
		}),
	});
	if (!response.ok) {
		const errorText = await response.text();
		console.error("Failed to get admin token:", errorText);
		throw new Error(`HTTP error! status: ${response.status}`);
	}
	const token = await response.text();
	console.log("Obtained Magento admin token:", token);
	return token;
}

app.get("/api/magento-report-last-week", async (req, res) => {
	try {
		const { start, end } = getLastFullWeekRange();
		console.log(`Fetching Magento data for ${start} to ${end}`);
		const startISO = `${start} 00:00:00`;
		const endISO = `${end} 23:59:59`;

		const url = `${MAGENTO_API_URL}/orders?searchCriteria[filter_groups][0][filters][0][field]=created_at&searchCriteria[filter_groups][0][filters][0][value]=${startISO}&searchCriteria[filter_groups][0][filters][0][condition_type]=from&searchCriteria[filter_groups][0][filters][1][field]=created_at&searchCriteria[filter_groups][0][filters][1][value]=${endISO}&searchCriteria[filter_groups][0][filters][1][condition_type]=to&searchCriteria[pageSize]=1000`;
		console.log("Constructed Magento API URL:", url);

		let token = MAGENTO_ADMIN_TOKEN;
		if (!token || token === "YOUR_ADMIN_TOKEN_HERE") {
			token = await getMagentoAdminToken();
		}

		const headers = {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			Accept: "application/json",
		};
		console.log("Headers prepared:", headers);

		console.log("Sending request to Magento API...");
		const ordersRes = await fetch(url, { headers });
		console.log("Magento API response status:", ordersRes.status);

		if (!ordersRes.ok) {
			const errorText = await ordersRes.text();
			console.error("Magento API error response:", errorText);
			throw new Error(`HTTP error! status: ${ordersRes.status}`);
		}

		const ordersData = await ordersRes.json();
		console.log(
			"Magento API response data:",
			JSON.stringify(ordersData, null, 2)
		);

		if (!ordersData.items) {
			console.warn(
				"No 'items' found in Magento response, returning default data"
			);
			return res.json({
				startDate: start,
				endDate: end,
				totalOrders: 0,
				salesTotal: 0,
				topSellingItem: undefined,
			});
		}

		const orders = ordersData.items;
		let salesTotal = 0;
		let totalOrders = orders.length;
		const itemMap = {};

		for (const order of orders) {
			if (!order.grand_total) {
				console.warn("Order missing grand_total:", order);
				continue;
			}
			salesTotal += Number(order.grand_total);
			for (const item of order.items || []) {
				if (!item.sku) {
					console.warn("Item missing sku:", item);
					continue;
				}
				itemMap[item.sku] = itemMap[item.sku] || {
					name: item.name || "Unknown",
					qty: 0,
				};
				itemMap[item.sku].qty += Number(item.qty_ordered || 0);
			}
		}

		let topItemSku = null,
			topQty = 0,
			topName = "";
		for (const [sku, data] of Object.entries(itemMap)) {
			if (data.qty > topQty) {
				topQty = data.qty;
				topItemSku = sku;
				topName = data.name;
			}
		}

		const responseData = {
			startDate: start,
			endDate: end,
			totalOrders,
			salesTotal,
			topSellingItem: topItemSku
				? { sku: topItemSku, name: topName, quantity: topQty }
				: undefined,
		};
		console.log("Prepared Magento response:", responseData);

		res.json(responseData);
	} catch (e) {
		console.error("Error in Magento fetch:", e.message, e.stack);
		res
			.status(500)
			.json({ error: `Failed to fetch Magento data: ${e.message}` });
	}
});

// --- EMAIL CSV REPORT ENDPOINT ---
function reportToCsv({ lead, google, magento }) {
	function formatCurrency(n) {
		if (typeof n !== "number") n = Number(n);
		return `$${n.toLocaleString(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		})}`;
	}
	const rows = [
		["Report for", `${google.startDate} to ${google.endDate}`],
		[],
		["Lead Name", lead.name],
		["Lead Email", lead.email],
		[],
		["Google Search Console"],
		["Clicks", google.clicks],
		["Impressions", google.impressions],
		[],
		["Magento"],
		["Total Orders", magento.totalOrders],
		["Sales Total", formatCurrency(magento.salesTotal)],
		["Top Selling Item", magento.topSellingItem?.name ?? ""],
		["Top Item SKU", magento.topSellingItem?.sku ?? ""],
		["Top Item Quantity", magento.topSellingItem?.quantity ?? 0],
	];
	return rows
		.map((row) =>
			row.map((x) => `"${(x ?? "").toString().replace(/"/g, '""')}"`).join(",")
		)
		.join("\r\n");
}

app.post("/api/email-report", async (req, res) => {
	const { lead, google, magento } = req.body || {};
	if (!lead || !lead.email || !google || !magento) {
		console.log("Missing required data for email:", { lead, google, magento });
		return res.status(500).json({ error: "Missing required report data." });
	}
	const csv = reportToCsv({ lead, google, magento });

	const transporter = nodemailer.createTransport({
		host: SMTP_HOST,
		port: SMTP_PORT,
		secure: true,
		auth: {
			user: SMTP_USER,
			pass: SMTP_PASS,
		},
	});

	try {
		console.log("Sending email to:", lead.email);
		await transporter.sendMail({
			from: EMAIL_FROM,
			to: lead.email,
			subject: `Weekly Report: ${google.startDate} to ${google.endDate}`,
			text: `Attached is the weekly report for ${google.startDate} to ${google.endDate}`,
			attachments: [
				{
					filename: `report_${google.startDate}_to_${google.endDate}.csv`,
					content: csv,
				},
			],
		});
		console.log("Email sent successfully");
		res.json({ success: true });
	} catch (e) {
		console.error("Error sending email:", e.message, e.stack);
		res.status(500).json({ error: "Failed to send email." });
	}
});

app.listen(PORT, () => {
	console.log(`API server running on http://localhost:${PORT}`);
});
