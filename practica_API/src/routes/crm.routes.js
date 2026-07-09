const express = require("express");
const crmController = require("../controllers/crm.controller");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

router.get("/crm", asyncHandler(crmController.getCrmPage));
router.get("/api/crm", asyncHandler(crmController.getCrmData));
router.patch("/api/crm/songs/:id/status", asyncHandler(crmController.updateSongStatus));

module.exports = router;
