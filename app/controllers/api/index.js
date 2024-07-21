const router = require('express').Router();
const { ObjectID } = require('mongodb');
const Shopify = require('shopify-api-node');
const StoreModel = require(_base+'app/models/stores');
const jwt = require('express-jwt');
const config = require(_base + '/app/config/config');

// Public Routes
router.use('/storefront', require('./storefront'));
router.use('/webhook', require('./webhook'));



// Protected Routes
router.use(jwt({
  secret: config.shopify_api_secret,
  algorithms: ['HS256'], 
  requestProperty: 'shopifyPayload',
  ignoreNotBefore: true,
}), getStoreFromRequest);

async function getStoreFromRequest(req, res, next) {
  const domain = req.shopifyPayload.dest.replace(/^https:\/\//, '');
  const Store = new StoreModel(req, res);
  const store = await Store.get({
    domain: domain
  })

  if(!store){
    return res.status(404).send({msg: "No Store Found"});
  }

  req.auth_store = store;
  req.shopify = new Shopify({
    shopName: domain,
    accessToken: store.access_token,
    apiVersion: '2021-01',
  });

  next();
}

router.post('/save', async function(req, res) {
  const Store = new StoreModel(req, res);
  const store = await Store.update({ domain: req.auth_store.domain }, {
    hidePaypal: req.body.hidePaypal
  })

  res.end();
})

router.use('/account', require('./account'));

module.exports = router;
