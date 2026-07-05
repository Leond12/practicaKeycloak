const express = require("express");
const songsController = require("../controllers/songs.controller");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

router.get("/health", asyncHandler(songsController.health));
router.get("/canciones", asyncHandler(songsController.listSongs));
router.post("/canciones", asyncHandler(songsController.createSongs));
router.patch("/canciones/:id", asyncHandler(songsController.updateSong));
router.delete("/canciones/:id", asyncHandler(songsController.deleteSong));

module.exports = router;
