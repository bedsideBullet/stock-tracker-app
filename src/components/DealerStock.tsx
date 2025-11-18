import React, { useState, useEffect } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { saveAs } from "file-saver";
import Papa from "papaparse";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { debounce } from "lodash";

const API_URL = "http://localhost:3001/stock";

type FtpServer = {
	name: string;
	host: string;
	username: string;
	password: string;
	port: number;
};
type FtpServers = Record<string, FtpServer>;

function DealerStock({ onBack }) {
	const [tableData, setTableData] = useState<any[]>([]);
	const [searchTerm, setSearchTerm] = useState("");
	const [sortConfig, setSortConfig] = useState<{
		key: string | null;
		direction: "ascending" | "descending";
	}>({
		key: null,
		direction: "ascending",
	});
	const [ftpServers, setFtpServers] = useState<FtpServers>(() => {
		const saved = localStorage.getItem("ftpServers");
		return saved
			? JSON.parse(saved)
			: {
					ftp1: {
						name: "FTP 1",
						host: "ftp1.example.com",
						username: "user1",
						password: "pass1",
						port: 21,
					},
					ftp2: {
						name: "ftp2",
						host: "ftp2.example.com",
						username: "user2",
						password: "pass2",
						port: 21,
					},
					ftp3: {
						name: "ftp3",
						host: "ftp3.example.com",
						username: "user3",
						password: "pass3",
						port: 21,
					},
					ftp4: {
						name: "ftp4",
						host: "ftp4.example.com",
						username: "user4",
						password: "pass4",
						port: 21,
					},
			  };
	});
	const [lastUploadTimes, setLastUploadTimes] = useState(() => {
		const saved = localStorage.getItem("lastUploadTimes");
		return saved
			? JSON.parse(saved)
			: {
					ftp1: null,
					ftp2: null,
					ftp3: null,
					ftp4: null,
			  };
	});
	const [showModal, setShowModal] = useState(false);
	const [currentPage, setCurrentPage] = useState(1);
	const [itemsPerPage, setItemsPerPage] = useState(10);

	// Progress state
	const [progress, setProgress] = useState<number>(0);
	const [progressVisible, setProgressVisible] = useState<boolean>(false);
	const [progressLabel, setProgressLabel] = useState<string>("");

	// Persist ftpServers and lastUploadTimes to localStorage
	useEffect(() => {
		localStorage.setItem("ftpServers", JSON.stringify(ftpServers));
		localStorage.setItem("lastUploadTimes", JSON.stringify(lastUploadTimes));
	}, [ftpServers, lastUploadTimes]);

	// Fetch stock data on mount
	useEffect(() => {
		fetchStock();
	}, []);

	const fetchStock = async () => {
		try {
			const response = await fetch(API_URL);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();
			setTableData(
				data.map((item) => ({
					...item,
					quantity: item["IN Stock"] ?? 0,
				}))
			);
		} catch (error) {
			console.error("Error fetching stock:", error);
			toast.error("Failed to fetch stock data");
		}
	};

	const handleSearch = (e) => {
		setSearchTerm(e.target.value);
		setCurrentPage(1); // Reset to first page on search
	};

	const handleSort = (key) => {
		let direction: "ascending" | "descending" = "ascending";
		if (sortConfig.key === key && sortConfig.direction === "ascending") {
			direction = "descending";
		}
		setSortConfig({ key, direction });
		const sortedData = [...tableData].sort((a, b) => {
			if (a[key] < b[key]) return direction === "ascending" ? -1 : 1;
			if (a[key] > b[key]) return direction === "ascending" ? 1 : -1;
			return 0;
		});
		setTableData(sortedData);
	};

	const debouncedUpdate = debounce((itemId, quantity) => {
		fetch(`${API_URL}/${itemId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ "IN Stock": quantity }),
		}).then(() => fetchStock());
	}, 500);

	const handleQuantityChange = (index, value) => {
		const newData = [...tableData];
		newData[index].quantity = parseInt(value) || 0;
		setTableData(newData);
		debouncedUpdate(newData[index].id, newData[index].quantity);
	};

	const handleAddPart = async () => {
		const newPart = {
			"Part Number": `PART${tableData.length + 1}`,
			"IN Stock": 0,
			"Date Time": new Date().toLocaleDateString("en-US", {
				timeZone: "America/Chicago",
			}),
			quantity: 0,
		};
		try {
			const response = await fetch(API_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(newPart),
			});
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			fetchStock();
			toast.success("Part added successfully");
		} catch (error) {
			console.error("Error adding part:", error);
			toast.error("Failed to add part");
		}
	};

	const handleRemovePart = (index) => {
		const item = tableData[index];
		const toastId = toast(
			<div>
				<p>Are you sure you want to delete {item["Part Number"]}?</p>
				<button
					className="btn btn-danger btn-sm me-2"
					onClick={async () => {
						try {
							const response = await fetch(`${API_URL}/${item.id}`, {
								method: "DELETE",
							});
							if (!response.ok) {
								throw new Error(`HTTP error! status: ${response.status}`);
							}
							fetchStock();
							toast.success("Part removed successfully");
							toast.dismiss(toastId);
						} catch (error) {
							console.error("Error removing part:", error);
							toast.error("Failed to remove part");
							toast.dismiss(toastId);
						}
					}}
				>
					Confirm
				</button>
				<button
					className="btn btn-secondary btn-sm"
					onClick={() => toast.dismiss(toastId)}
				>
					Cancel
				</button>
			</div>,
			{
				autoClose: false,
				closeOnClick: false,
				draggable: false,
				closeButton: false,
				position: "top-center",
			}
		);
	};

	const handleExportCSV = async () => {
		setProgressLabel("Exporting CSV...");
		setProgressVisible(true);
		setProgress(0);

		const today = new Date().toLocaleDateString("en-US", {
			timeZone: "America/Chicago",
		});
		const updatedData = tableData.map((item) => ({
			...item,
			"Date Time": today,
		}));

		try {
			let completed = 0;
			await Promise.all(
				updatedData.map((item, idx) =>
					fetch(`${API_URL}/${item.id}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ "Date Time": today }),
					}).then((res) => {
						if (!res.ok) {
							throw new Error(`HTTP error! status: ${res.status}`);
						}
						completed++;
						setProgress(Math.round((completed / updatedData.length) * 100));
						return res;
					})
				)
			);
			setTableData(updatedData);
			const csv = Papa.unparse(
				updatedData.map((item) => ({
					"Part Number": item["Part Number"],
					"In Stock": item.quantity,
					"Date Time": item["Date Time"],
				}))
			);
			const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
			saveAs(blob, "PSC_Stock.csv");
			setProgress(100);
			setTimeout(() => setProgressVisible(false), 700);
			toast.success("CSV exported successfully");
		} catch (error) {
			console.error("Error updating dates for CSV export:", error);
			setProgressVisible(false);
			toast.error("Failed to export CSV");
		}
	};

	const handleFtpUpload = async (ftpId) => {
		if (!tableData.length) {
			toast.error("No stock data to upload");
			return;
		}
		setProgressLabel(`Uploading to ${ftpServers[ftpId].name}...`);
		setProgressVisible(true);
		setProgress(0);

		const today = new Date().toLocaleDateString("en-US", {
			timeZone: "America/Chicago",
		});
		const updatedData = tableData.map((item) => ({
			...item,
			"Date Time": today,
		}));

		try {
			let completed = 0;
			await Promise.all(
				updatedData.map((item) =>
					fetch(`${API_URL}/${item.id}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ "Date Time": today }),
					}).then((res) => {
						if (!res.ok) {
							throw new Error(`HTTP error! status: ${res.status}`);
						}
						completed++;
						setProgress(Math.round((completed / updatedData.length) * 70)); // up to 70% for patching
						return res;
					})
				)
			);
			setTableData(updatedData);

			const response = await fetch("http://localhost:3001/upload-ftp", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					ftpConfig: ftpServers[ftpId],
					stockData: updatedData,
				}),
			});
			setProgress(85);

			if (!response.ok) {
				const text = await response.text();
				throw new Error(
					`HTTP error! status: ${response.status}, body: ${text}`
				);
			}

			const contentType = response.headers.get("content-type");
			if (!contentType || !contentType.includes("application/json")) {
				const text = await response.text();
				throw new Error(
					`Invalid response format: expected JSON, got ${
						contentType || "no content-type"
					}, body: ${text}`
				);
			}

			const result = await response.json();
			setLastUploadTimes((prev) => ({ ...prev, [ftpId]: today }));
			setProgress(100);
			setTimeout(() => setProgressVisible(false), 700);
			toast.success(`Uploaded to ${ftpServers[ftpId].name} at ${today}`);
		} catch (error) {
			console.error("Error during FTP upload:", error);
			setProgressVisible(false);
			toast.error(`Error during FTP upload: ${error.message}`);
		}
	};

	const handleEditFtp = () => {
		setShowModal(true);
	};

	const handleSaveFtp = () => {
		const isValid = Object.values(ftpServers).every(
			(server) =>
				server.name &&
				server.host &&
				server.username &&
				server.password &&
				server.port
		);
		if (!isValid) {
			toast.error(
				"All FTP fields (name, host, username, password, port) are required"
			);
			return;
		}
		const renamedServers = {};
		const renamedTimes = {};
		Object.keys(ftpServers).forEach((oldId) => {
			const newId = ftpServers[oldId].name;
			renamedServers[newId] = ftpServers[oldId];
			if (lastUploadTimes[oldId]) {
				renamedTimes[newId] = lastUploadTimes[oldId];
			}
			if (oldId !== newId) {
				delete renamedServers[oldId];
				delete renamedTimes[oldId];
			}
		});
		setFtpServers(renamedServers);
		setLastUploadTimes(renamedTimes);
		setShowModal(false);
		toast.success("FTP configurations saved");
	};

	const handleInputChange = (e, ftpId) => {
		const { name, value } = e.target;
		setFtpServers((prev) => ({
			...prev,
			[ftpId]: {
				...prev[ftpId],
				[name]: name === "port" ? parseInt(value) || 21 : value,
			},
		}));
	};

	const handleAddFtpServer = () => {
		const newFtpId = `ftp${Object.keys(ftpServers).length + 1}`;
		setFtpServers((prev) => ({
			...prev,
			[newFtpId]: {
				name: newFtpId,
				host: "",
				username: "",
				password: "",
				port: 21,
			},
		}));
		setLastUploadTimes((prev) => ({ ...prev, [newFtpId]: null }));
	};

	const handleRemoveFtpServer = (ftpId) => {
		setFtpServers((prev) => {
			const newServers = { ...prev };
			delete newServers[ftpId];
			return newServers;
		});
		setLastUploadTimes((prev) => {
			const newTimes = { ...prev };
			delete newTimes[ftpId];
			return newTimes;
		});
	};

	const handleItemsPerPageChange = (e) => {
		setItemsPerPage(parseInt(e.target.value));
		setCurrentPage(1);
	};

	const filteredData = tableData.filter((item) =>
		item["Part Number"].toLowerCase().includes(searchTerm.toLowerCase())
	);

	const indexOfLastItem = currentPage * itemsPerPage;
	const indexOfFirstItem = indexOfLastItem - itemsPerPage;
	const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);
	const totalPages = Math.ceil(filteredData.length / itemsPerPage);

	const paginate = (pageNumber) => setCurrentPage(pageNumber);

	const renderPagination = () => {
		const pages: React.ReactNode[] = [];
		const maxVisiblePages = 5;
		let startPage = Math.max(1, currentPage - 2);
		let endPage = Math.min(totalPages, currentPage + 2);

		if (endPage - startPage < maxVisiblePages - 1) {
			if (startPage === 1) endPage = Math.min(maxVisiblePages, totalPages);
			else if (endPage === totalPages)
				startPage = Math.max(1, totalPages - (maxVisiblePages - 1));
		}

		pages.push(
			<li
				key="first"
				className={`page-item ${currentPage === 1 ? "disabled" : ""}`}
			>
				<button onClick={() => paginate(1)} className="page-link">
					« First
				</button>
			</li>
		);

		if (startPage > 1) {
			pages.push(
				<li key="start-ellipsis" className="page-item disabled">
					<span className="page-link">...</span>
				</li>
			);
		}

		for (let i = startPage; i <= endPage; i++) {
			pages.push(
				<li
					key={i}
					className={`page-item ${currentPage === i ? "active" : ""}`}
				>
					<button onClick={() => paginate(i)} className="page-link">
						{i}
					</button>
				</li>
			);
		}

		if (endPage < totalPages) {
			pages.push(
				<li key="end-ellipsis" className="page-item disabled">
					<span className="page-link">...</span>
				</li>
			);
		}

		pages.push(
			<li
				key="last"
				className={`page-item ${currentPage === totalPages ? "disabled" : ""}`}
			>
				<button onClick={() => paginate(totalPages)} className="page-link">
					Last »
				</button>
			</li>
		);

		return pages;
	};

	const todaysDate = new Date().toLocaleDateString();

	return (
		<>
			<ToastContainer />

			{/* Progress Bar */}
			{progressVisible && (
				<div className="progress my-3" style={{ height: "30px" }}>
					<div
						className="progress-bar progress-bar-striped progress-bar-animated"
						role="progressbar"
						aria-valuenow={progress}
						aria-valuemin={0}
						aria-valuemax={100}
						style={{
							width: `${progress}%`,
							fontWeight: "bold",
							fontSize: "1.1em",
						}}
					>
						{progressLabel} {progress}%
					</div>
				</div>
			)}

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

			<div className="container mt-5 pt-4">
				<div className="text-center mb-4 mt-3">
					<h1 className="mb-2">Dealer Stock Management</h1>
					<h5 className="mb-0">Today's Date: {todaysDate}</h5>
				</div>
				<div className="mb-3">
					<input
						type="text"
						placeholder="Search Part Number..."
						value={searchTerm}
						onChange={handleSearch}
						className="form-control mb-2"
					/>
					<button onClick={handleAddPart} className="btn btn-success mt-2">
						Add Part
					</button>
					<button
						onClick={handleExportCSV}
						className="btn btn-primary mt-2 ms-2"
					>
						Export CSV
					</button>
					<button
						className="btn btn-secondary mt-2 ms-2"
						onClick={handleEditFtp}
					>
						Edit FTP Servers
					</button>
					{Object.keys(ftpServers).map((ftpId) => (
						<button
							key={ftpId}
							className="btn btn-primary mt-2 ms-2"
							onClick={() => handleFtpUpload(ftpId)}
							style={{ whiteSpace: "nowrap" }}
						>
							{ftpServers[ftpId].name}
							{lastUploadTimes[ftpId] ? ` ${lastUploadTimes[ftpId]}` : null}
						</button>
					))}
				</div>
				{currentItems.length > 0 && (
					<table className="table table-striped table-hover">
						<thead>
							<tr>
								<th onClick={() => handleSort("Part Number")}>
									Part Number{" "}
									{sortConfig.key === "Part Number" &&
										(sortConfig.direction === "ascending" ? "↑" : "↓")}
								</th>
								<th onClick={() => handleSort("quantity")}>
									In Stock{" "}
									{sortConfig.key === "quantity" &&
										(sortConfig.direction === "ascending" ? "↑" : "↓")}
								</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{currentItems.map((row, index) => (
								<tr key={row.id || index}>
									<td>{row["Part Number"]}</td>
									<td>
										<input
											type="number"
											value={row.quantity}
											onChange={(e) =>
												handleQuantityChange(
													indexOfFirstItem + index,
													e.target.value
												)
											}
											className="form-control"
											style={{ width: "100px" }}
										/>
									</td>
									<td>
										<button
											onClick={() => handleRemovePart(indexOfFirstItem + index)}
											className="btn btn-danger btn-sm"
										>
											Remove
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
				<nav>
					<select
						value={itemsPerPage}
						onChange={handleItemsPerPageChange}
						className="form-select mt-2"
						style={{
							width: "auto",
							display: "inline-block",
							marginBottom: "10px",
						}}
					>
						<option value={10}>10 per page</option>
						<option value={25}>25 per page</option>
						<option value={50}>50 per page</option>
						<option value={100}>100 per page</option>
					</select>
					<ul className="pagination justify-content-center">
						{renderPagination()}
					</ul>
				</nav>
				{showModal && (
					<div className="modal" style={{ display: "block" }} tabIndex={-1}>
						<div className="modal-dialog modal-lg">
							<div className="modal-content">
								<div className="modal-header">
									<h5 className="modal-title">Edit FTP Servers</h5>
									<button
										type="button"
										className="btn-close"
										onClick={() => setShowModal(false)}
									></button>
								</div>
								<div className="modal-body">
									{Object.keys(ftpServers).map((ftpId) => (
										<div key={ftpId} className="mb-3 border p-3 rounded">
											<div className="mb-2">
												<label className="form-label">Name</label>
												<input
													type="text"
													name="name"
													value={ftpServers[ftpId].name}
													onChange={(e) => handleInputChange(e, ftpId)}
													className="form-control"
													required
												/>
											</div>
											<div className="mb-2">
												<label className="form-label">Host</label>
												<input
													type="text"
													name="host"
													value={ftpServers[ftpId].host}
													onChange={(e) => handleInputChange(e, ftpId)}
													className="form-control"
													required
												/>
											</div>
											<div className="mb-2">
												<label className="form-label">Port</label>
												<input
													type="number"
													name="port"
													value={ftpServers[ftpId].port}
													onChange={(e) => handleInputChange(e, ftpId)}
													className="form-control"
													min="1"
													max="65535"
													required
												/>
											</div>
											<div className="mb-2">
												<label className="form-label">Username</label>
												<input
													type="text"
													name="username"
													value={ftpServers[ftpId].username}
													onChange={(e) => handleInputChange(e, ftpId)}
													className="form-control"
													required
												/>
											</div>
											<div className="mb-2">
												<label className="form-label">Password</label>
												<input
													type="password"
													name="password"
													value={ftpServers[ftpId].password}
													onChange={(e) => handleInputChange(e, ftpId)}
													className="form-control"
													required
												/>
											</div>
											<button
												onClick={() => handleRemoveFtpServer(ftpId)}
												className="btn btn-danger btn-sm"
											>
												Remove
											</button>
										</div>
									))}
									<button
										onClick={handleAddFtpServer}
										className="btn btn-success mt-3"
									>
										Add FTP Server
									</button>
								</div>
								<div className="modal-footer">
									<button
										type="button"
										className="btn btn-secondary"
										onClick={() => setShowModal(false)}
									>
										Close
									</button>
									<button
										type="button"
										className="btn btn-primary"
										onClick={handleSaveFtp}
									>
										Save changes
									</button>
								</div>
							</div>
						</div>
					</div>
				)}
			</div>
		</>
	);
}

export default DealerStock;
