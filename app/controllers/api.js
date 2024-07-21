const router = require('express').Router();

router.use('/', require('../controllers/api/index'));

module.exports = router;
