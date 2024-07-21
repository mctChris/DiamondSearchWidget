const router = require('express').Router();
const { ObjectID } = require('mongodb');
const Shopify = require('shopify-api-node');
const StoreModel = require(_base+'app/models/stores');
const jwt = require('express-jwt');
const config = require(_base + '/app/config/config');
const ejs = require('ejs');







router.get('/', async function(req, res) {

  ejs.renderFile(_viewPath + 'index.ejs', function(err, data) {
    res.send(data);
  }); 

});

module.exports = router;
