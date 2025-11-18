import React, { useState, useEffect } from "react";
import saveAs from "file-saver";
import { utils, write } from "xlsx";
import * as ExcelJS from "exceljs";
import {
	Container,
	Form,
	Button,
	Row,
	Col,
	Card,
	Alert,
} from "react-bootstrap";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

interface GoogleData {
	startDate: string;
	endDate: string;
	clicks: number;
	impressions: number;
}

interface SalesData {
	orderTotal: number;
	salesTotal: number;
	clicks: number;
	impressions: number;
	topSeller: string;
}

interface PreviousSalesData {
	orderTotal?: number;
	salesTotal?: number;
	clicks?: number;
	impressions?: number;
}

interface AppProps {
	onBack?: () => void;
}

const GOOGLE_API_URL = "http://localhost:4000/api/search-console-last-week";

function ReportGenerator({ onBack }: AppProps) {
	const [salesData, setSalesData] = useState<SalesData>({
		orderTotal: 0,
		salesTotal: 0,
		clicks: 0,
		impressions: 0,
		topSeller: "",
	});
	const [previousTopSellers, setPreviousTopSellers] = useState<string[]>([]);
	const [previousSalesData, setPreviousSalesData] = useState<PreviousSalesData>(
		{}
	);
	const [alertMessage, setAlertMessage] = useState<string | null>(null);
	const [startDate, setStartDate] = useState<string>("");
	const [googleData, setGoogleData] = useState<GoogleData | null>(null);
	const [loadingGoogle, setLoadingGoogle] = useState<boolean>(false);

	useEffect(() => {
		const loadFromLocalStorage = (
			key: string
		): string[] | PreviousSalesData => {
			const storedData = localStorage.getItem(key);
			if (storedData) {
				try {
					return JSON.parse(storedData);
				} catch (e) {
					console.error(`Error parsing ${key} data:`, e);
					return key === "topSellers" ? [] : {};
				}
			}
			return key === "topSellers" ? [] : {};
		};

		setPreviousTopSellers(loadFromLocalStorage("topSellers") as string[]);
		setPreviousSalesData(
			loadFromLocalStorage("salesData") as PreviousSalesData
		);
	}, []);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		let parsedValue: string | number;

		if (name === "topSeller") {
			parsedValue = value;
		} else {
			parsedValue = parseFloat(value) || 0;
			if (["clicks", "impressions"].includes(name)) {
				parsedValue *= 1000;
			}
		}

		setSalesData((prevState) => ({
			...prevState,
			[name]: parsedValue as number | string,
		}));
	};

	const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setStartDate(e.target.value);
	};

	const handlePullGoogleData = async () => {
		setLoadingGoogle(true);
		setAlertMessage(null);
		try {
			const res = await fetch(GOOGLE_API_URL);
			if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
			const data: GoogleData = await res.json();
			setGoogleData(data);
			setSalesData((prevState) => ({
				...prevState,
				clicks: data.clicks,
				impressions: data.impressions,
			}));
			setStartDate(data.startDate);
			toast.success(
				`Fetched Search Console data: ${data.clicks} clicks, ${data.impressions} impressions`
			);
		} catch (e) {
			setAlertMessage("Failed to load Google data.");
			toast.error("Failed to load Google data.");
			console.error("Failed to load Google data:", e);
		}
		setLoadingGoogle(false);
	};

	const calculatePercentageChange = (
		current: number,
		previous: number
	): number => (previous !== 0 ? ((current - previous) / previous) * 100 : 0);

	const generateReport = async () => {
		if (!startDate) {
			setAlertMessage("Please select a start date or pull Google data.");
			return;
		}

		const { orderTotal, salesTotal, clicks, impressions, topSeller } =
			salesData;
		const {
			orderTotal: prevOrderTotal = 0,
			salesTotal: prevSalesTotal = 0,
			clicks: prevClicks = 0,
			impressions: prevImpressions = 0,
		} = previousSalesData;

		const conversionRate = orderTotal > 0 ? (orderTotal / clicks) * 100 : 0;
		const avgOrderValue = orderTotal > 0 ? salesTotal / orderTotal : 0;
		const clickThroughRate = impressions > 0 ? (clicks / impressions) * 100 : 0;

		const metrics = [
			{ key: "Order Total", current: orderTotal, previous: prevOrderTotal },
			{ key: "Sales Total", current: salesTotal, previous: prevSalesTotal },
			{ key: "Clicks", current: clicks, previous: prevClicks },
			{ key: "Impressions", current: impressions, previous: prevImpressions },
			{
				key: "Click Through Rate",
				current: clickThroughRate,
				previous:
					prevImpressions > 0 ? (prevClicks / prevImpressions) * 100 : 0,
			},
			{
				key: "Average Order Value",
				current: avgOrderValue,
				previous: prevOrderTotal > 0 ? prevSalesTotal / prevOrderTotal : 0,
			},
			{
				key: "Conversion Rate (%)",
				current: conversionRate,
				previous: prevClicks > 0 ? (prevOrderTotal / prevClicks) * 100 : 0,
			},
		];

		const updatedTopSellers = [topSeller, ...previousTopSellers].slice(0, 4);

		try {
			localStorage.setItem("topSellers", JSON.stringify(updatedTopSellers));
			localStorage.setItem(
				"salesData",
				JSON.stringify({ orderTotal, salesTotal, clicks, impressions })
			);
			setPreviousTopSellers(updatedTopSellers);
			setPreviousSalesData({ orderTotal, salesTotal, clicks, impressions });
		} catch (e) {
			setAlertMessage("Error saving data to localStorage.");
			console.error("Error saving to localStorage:", e);
			return;
		}

		const reportStartDate = new Date(startDate);
		const reportEndDate = new Date(reportStartDate);
		reportEndDate.setDate(reportStartDate.getDate() + 6);

		const formattedStartDate = reportStartDate.toISOString().split("T")[0];
		const formattedEndDate = reportEndDate.toISOString().split("T")[0];

		const worksheetData = [
			[`Ecommerce Report (${formattedStartDate} to ${formattedEndDate})`],
			["Metric", "Last Week", "Current", "Change (%)"],
			...metrics.map((item) => [
				item.key,
				item.previous.toFixed(2),
				item.current.toFixed(2),
				calculatePercentageChange(item.current, item.previous).toFixed(2),
			]),
			["Top Sellers (Last 4 Weeks)"],
			...updatedTopSellers.map((seller) => ["", seller]),
		];

		const worksheet = utils.aoa_to_sheet(worksheetData);
		const workbook = utils.book_new();
		utils.book_append_sheet(workbook, worksheet, "Sales Report");

		try {
			const excelBuffer = write(workbook, { bookType: "xlsx", type: "array" });
			const blob = new Blob([excelBuffer], {
				type: "application/octet-stream",
			});

			const workbookExcelJS = new ExcelJS.Workbook();
			const worksheetExcelJS = workbookExcelJS.addWorksheet("Sales Report");

			const arrayBuffer = await blob.arrayBuffer();
			await workbookExcelJS.xlsx.load(arrayBuffer);

			worksheetExcelJS.getCell("A1").font = { bold: true, size: 14 };
			worksheetExcelJS.getRow(1).fill = {
				type: "pattern",
				pattern: "solid",
				fgColor: { argb: "FFFF00" },
			};

			const topSellersStartRow =
				worksheetData.findIndex(
					(row) => row[0] === "Top Sellers (Last 4 Weeks)"
				) + 1;

			for (let i = 0; i < updatedTopSellers.length; i++) {
				worksheetExcelJS.getCell(`B${topSellersStartRow + i + 1}`).font = {
					italic: true,
				};
			}

			const styledExcelBuffer = await workbookExcelJS.xlsx.writeBuffer();

			saveAs(
				new Blob([styledExcelBuffer], {
					type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				}),
				`ECR_${formattedEndDate}.xlsx`
			);

			setAlertMessage("Report generated successfully!");
		} catch (e) {
			setAlertMessage("Error generating the Excel file.");
			console.error("Error in generating or saving Excel file:", e);
		}
	};

	return (
		<>
			<ToastContainer />
			<div
				style={{ position: "fixed", top: "40px", left: "40px", zIndex: 1000 }}
			>
				<a
					href="#"
					onClick={(e) => {
						e.preventDefault();
						if (onBack) onBack();
					}}
				>
					<img src="/logo.png" alt="Logo" style={{ height: "75px" }} />
				</a>
			</div>
			<Container
				fluid
				className="d-flex justify-content-center align-items-center min-vh-100"
				style={{ height: "100vh", width: "100vw" }}
			>
				<Card
					style={{ width: "100%", maxWidth: "600px", padding: "20px" }}
					className="shadow-lg"
				>
					<h1 className="text-center mb-4">Weekly Sales Report Generator</h1>
					{alertMessage && <Alert variant="info">{alertMessage}</Alert>}
					<Form>
						<Form.Group controlId="startDate" className="mb-4">
							<Form.Label>Select Start Date</Form.Label>
							<Form.Control
								type="date"
								value={startDate}
								onChange={handleDateChange}
								disabled={googleData !== null}
							/>
						</Form.Group>

						<Row className="mb-3">
							<Col sm={6}>
								<Form.Group controlId="orderTotal">
									<Form.Label>Order Total</Form.Label>
									<Form.Control
										type="number"
										name="orderTotal"
										value={salesData.orderTotal || ""}
										onChange={handleInputChange}
										placeholder="Enter order total"
									/>
								</Form.Group>
							</Col>
							<Col sm={6}>
								<Form.Group controlId="salesTotal">
									<Form.Label>Sales Total</Form.Label>
									<Form.Control
										type="number"
										name="salesTotal"
										value={salesData.salesTotal || ""}
										onChange={handleInputChange}
										placeholder="Enter sales total"
									/>
								</Form.Group>
							</Col>
						</Row>

						<Row className="mb-3">
							<Col sm={6}>
								<Form.Group controlId="clicks">
									<Form.Label>Clicks (in thousands)</Form.Label>
									<Form.Control
										type="number"
										name="clicks"
										value={salesData.clicks / 1000 || ""}
										onChange={handleInputChange}
										placeholder="Enter clicks"
										disabled={googleData !== null}
									/>
								</Form.Group>
							</Col>
							<Col sm={6}>
								<Form.Group controlId="impressions">
									<Form.Label>Impressions (in thousands)</Form.Label>
									<Form.Control
										type="number"
										name="impressions"
										value={salesData.impressions / 1000 || ""}
										onChange={handleInputChange}
										placeholder="Enter impressions"
										disabled={googleData !== null}
									/>
								</Form.Group>
							</Col>
						</Row>

						<Row className="mb-4">
							<Col sm={6}>
								<Form.Group controlId="topSeller">
									<Form.Label>Top Seller</Form.Label>
									<Form.Control
										type="text"
										name="topSeller"
										value={salesData.topSeller || ""}
										onChange={handleInputChange}
										placeholder="Enter top seller of the week"
									/>
								</Form.Group>
							</Col>
						</Row>

						<Row className="mb-3">
							<Col>
								<Button
									variant="primary"
									onClick={handlePullGoogleData}
									disabled={loadingGoogle}
									className="w-100 mb-2"
								>
									{loadingGoogle ? "Loading..." : "Pull Google Data"}
								</Button>
								<Button
									variant="success"
									onClick={generateReport}
									className="w-100"
								>
									Generate Report
								</Button>
							</Col>
						</Row>
					</Form>
				</Card>
			</Container>
		</>
	);
}

export default ReportGenerator;
