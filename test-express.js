const express = require("express");
const app = express();
app.get("/", async (req, res) => {
  throw new Error("test error");
});
app.listen(3001, () => console.log("running"));
