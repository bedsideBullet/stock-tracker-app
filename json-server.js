import jsonServer from "json-server";
import { Client } from "basic-ftp";
import Papa from "papaparse";
import { Readable } from "stream";

const server = jsonServer.create();
const router = jsonServer.router("db.json");
const middlewares = jsonServer.defaults();

server.use(middlewares);
server.use(jsonServer.bodyParser);

server.post("/upload-ftp", (req, res) => {
	const { ftpConfig, stockData } = req.body;

	// Validate FTP configuration
	if (
		!ftpConfig ||
		!ftpConfig.host ||
		!ftpConfig.username ||
		!ftpConfig.password ||
		!ftpConfig.port ||
		!ftpConfig.name
	) {
		res.status(400).json({ error: "Missing or incomplete FTP configuration" });
		return;
	}

	// Validate stock data
	if (!stockData || !Array.isArray(stockData) || stockData.length === 0) {
		res.status(400).json({ error: "No stock data provided" });
		return;
	}

	// Convert stock data to CSV
	const csv = Papa.unparse(
		stockData.map((item) => ({
			"Part Number": item["Part Number"],
			"In Stock": item["IN Stock"],
			"Date Time": item["Date Time"],
		}))
	);

	const client = new Client();
	client.ftp.verbose = true; // Optional: Enable verbose logging for debugging

	client
		.access({
			host: ftpConfig.host,
			port: parseInt(ftpConfig.port),
			user: ftpConfig.username,
			password: ftpConfig.password,
		})
		.then(() => {
			// Create a readable stream from the CSV string using a custom implementation
			const csvStream = Readable.from([csv]);

			return client.uploadFrom(csvStream, "PSC_Stock.csv");
		})
		.then(() => {
			console.log(`File uploaded successfully to ${ftpConfig.name}`);
			res.json({ message: "File uploaded successfully" });
		})
		.catch((err) => {
			console.error(`FTP error for ${ftpConfig.name}:`, err);
			res.status(500).json({ error: `FTP upload failed: ${err.message}` });
		})
		.finally(() => {
			client.close(); // Ensure client is closed regardless of success or failure
		});
});

server.use(router);
server.listen(3001, () => {
	console.log("JSON Server is running on port 3001");
});
