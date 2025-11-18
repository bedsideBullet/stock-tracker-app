import React from "react";

interface DashboardProps {
	onShowStock: () => void;
	onShowReport: () => void;
}

export default function Dashboard({
	onShowStock,
	onShowReport,
}: DashboardProps) {
	return (
		<div className="container d-flex flex-column justify-content-center align-items-center min-vh-100">
			<div
				style={{ position: "fixed", top: "40px", left: "40px", zIndex: 1000 }}
			>
				<img src="/logo.png" alt="Logo" style={{ height: "75px" }} />
			</div>
			<div className="text-center">
				<h1 className="mb-4">WD & Web Dashboard</h1>
				<button
					className="btn btn-primary btn-lg mb-3"
					style={{ width: "250px" }}
					onClick={onShowStock}
				>
					Dealer Stock
				</button>
				<br />
				{/* <button
					className="btn btn-secondary btn-lg"
					style={{ width: "250px" }}
					onClick={onShowReport}
				>
					eCommerce Report
				</button> */}
			</div>
		</div>
	);
}
