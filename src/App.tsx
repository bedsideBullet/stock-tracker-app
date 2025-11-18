import React, { useState } from "react";
import Dashboard from "./components/Dashboard";
import DealerStock from "./components/DealerStock";
import ReportGenerator from "./components/ReportGenerator";

type PageType = "dashboard" | "dealerStock" | "report";

function App() {
	const [page, setPage] = useState<"dashboard" | "dealerStock" | "report">(
		"dashboard"
	);

	return (
		<>
			{page === "dashboard" && (
				<Dashboard
					onShowStock={() => setPage("dealerStock")}
					onShowReport={() => setPage("report")}
				/>
			)}
			{page === "dealerStock" && (
				<DealerStock onBack={() => setPage("dashboard")} />
			)}
			{page === "report" && (
				<ReportGenerator onBack={() => setPage("dashboard")} />
			)}
		</>
	);
}

export default App;
