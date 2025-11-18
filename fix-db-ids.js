import { readFileSync, writeFileSync } from "fs";

// Read db.json
const db = JSON.parse(readFileSync("db.json", "utf8"));

// Add IDs to stock items
db.stock = db.stock.map((item, index) => ({
	id: index + 1,
	...item,
}));

// Write back to db.json
writeFileSync("db.json", JSON.stringify(db, null, 2));
console.log("IDs added to db.json");
