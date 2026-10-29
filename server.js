const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: "https://pavelkhan63.github.io"
}));

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Video Downloader API is running!");
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Backend is running"
  });
});

app.post("/api/download", (req, res) => {
  const { url } = req.body || {};

  if (!url) {
    return res.status(400).json({
      success: false,
      message: "ভিডিওর URL দিন।"
    });
  }

  res.status(501).json({
    success: false,
    message: "এখনো ভিডিও ডাউনলোড ফিচার যুক্ত করা হয়নি।"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
