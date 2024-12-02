const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const db = new sqlite3.Database("./habits.db", (err) => {
  if (err) console.error("Error opening database:", err.message);
  else console.log("Connected to SQLite database");
});

app.use(bodyParser.json());

db.run(
  `CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    dailyGoal TEXT NOT NULL,
    completion TEXT DEFAULT '[]'
  )`
);

const wss = new WebSocket.Server({ port: 8080 });
wss.on("connection", (ws) => ws.send("Welcome to the Habit Tracker!"));

require("node-cron").schedule("0 8 * * *", () => {
  const message = "Reminder: Complete your habits today!";
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
});

app.post("/habits", (req, res) => {
  const { name, dailyGoal } = req.body;
  db.run("INSERT INTO habits (name, dailyGoal) VALUES (?, ?)", [name, dailyGoal], function (err) {
    if (err) return res.status(400).json({ error: err.message });
    res.status(201).json({ id: this.lastID, name, dailyGoal });
  });
});

app.put("/habits/:id", (req, res) => {
  const { completed } = req.body;
  const habitId = req.params.id;
  const currentDate = new Date().toISOString().split("T")[0];

  if (completed !== undefined) {
    db.get("SELECT * FROM habits WHERE id = ?", [habitId], (err, row) => {
      if (err || !row) return res.status(500).send("Habit not found");

      let completion = row.completion ? JSON.parse(row.completion) : [];

      completion.push({ date: currentDate, completed });

      if (completion.length > 7) completion.shift();

      db.run("UPDATE habits SET completion = ? WHERE id = ?", [JSON.stringify(completion), habitId], (err) => {
        if (err) return res.status(500).send("Error updating habit");
        res.send({ message: "Habit updated successfully!" });
      });
    });
  } else {
    res.status(400).send("Please provide a valid 'completed' value");
  }
});

app.get("/habits", (req, res) => {
  db.all("SELECT * FROM habits", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    rows.forEach((row) => (row.completion = JSON.parse(row.completion || "[]")));
    res.status(200).json(rows);
  });
});

app.get("/habits/report", (req, res) => {
  db.all("SELECT * FROM habits", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const report = rows.map((row) => ({
      name: row.name,
      dailyGoal: row.dailyGoal,
      completion: JSON.parse(row.completion || "[]").map((entry) => entry.date),
    }));
    res.status(200).json(report);
  });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
