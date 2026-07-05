const path = require("path");
const { query } = require("../config/database");
const crmRepository = require("../repositories/crm.repository");
const { success } = require("../utils/api-response");

async function getCrmPage(req, res) {
  res.sendFile(path.resolve(process.cwd(), "public", "crm.html"));
}

async function getCrmData(req, res) {
  const rows = await crmRepository.listRows({ query });
  res.status(200).json(success("Datos del CRM obtenidos", { rows }));
}

module.exports = {
  getCrmPage,
  getCrmData
};
