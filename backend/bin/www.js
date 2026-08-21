require('dotenv').config();
const app = require('../app');

const PORT = process.env.PORT || 8080;

const server = app.listen(PORT, () => {
  console.log(`後端伺服器運行於 http://localhost:${PORT}`);
});

module.exports = server;
