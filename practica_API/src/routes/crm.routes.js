const express = require("express");
const crmController = require("../controllers/crm.controller");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

router.get("/crm", asyncHandler(crmController.getCrmPage));
router.get("/api/crm", asyncHandler(crmController.getCrmData));
router.post("/api/crm/play/:songId", asyncHandler(crmController.playSongFromCrm));
router.post("/api/crm/stop/:songId", asyncHandler(crmController.stopSongFromCrm));

module.exports = router;

