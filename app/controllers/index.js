var router = require('express').Router();
var Shopify = require('shopify-api-node');
var cryptoRandomString = require('crypto-random-string');
var config = require(_base + '/app/config/config');
var querystring = require('querystring');
var https = require("https");
var path = require('path');
var shopifyAPI = require('shopify-node-api');
var nonce = '202b7dfa31ebb8333e53';

router.get('/install', async function (req, res, next) {
  console.log('Install');
  var shop = req.query.shop;

  // var nonce = cryptoRandomString({length: 20});
  console.log(nonce);

  var Shopify = new shopifyAPI({
    shop: shop, // MYSHOP.myshopify.com
    shopify_api_key: config.shopify_api_key, // Your API key
    shopify_shared_secret: config.shopify_api_secret, // Your Shared Secret
    shopify_scope: config.shopify_scopes,
    redirect_uri: config.shopify_redirect_uri,
    nonce: nonce // you must provide a randomly selected value unique for each authorization request
  });

  var auth_url = Shopify.buildAuthURL();

  console.log('auth', auth_url);

  // res.redirect(auth_url);
  res.end('<html><body><script>window.top.location.href="' + auth_url + '"</script></body></html>');   
});

router.get('/auth/callback', async function (req, res, next) {
  console.log('Auth Callback')
  var {code, state, hmac, shop} = req.query;
  var Shopify = new shopifyAPI({
    shop: shop, // MYSHOP.myshopify.com
    shopify_api_key: config.shopify_api_key, // Your API key
    shopify_shared_secret: config.shopify_api_secret, // Your Shared Secret
    shopify_scope: config.shopify_scopes,
    redirect_uri: config.shopify_redirect_uri,
    nonce: nonce
  });

  Shopify.exchange_temporary_token(req.query, function(err, data){
  // This will return successful if the request was authentic from Shopify
  // Otherwise err will be non-null.
  // The module will automatically update your config with the new access token
  // It is also available here as data['access_token']
    if(err){
      return res.status(401).send({msg: err.message});
    }
    console.log('env',process.env.SHOPIFY_API_VERSION);

    var p1 =  Shopify.post(`/admin/api/${process.env.SHOPIFY_API_VERSION}/webhooks.json`, {
      "webhook": {
        "topic": "products/update",
        "address": config.products_update_webhook_endpoint,
        "format": "json"
      }
    }, (err, data) => {
      console.log('product update', err, data);
    });

    var p2 =  Shopify.post(`/admin/api/${process.env.SHOPIFY_API_VERSION}/webhooks.json`, {
      "webhook": {
        "topic": "orders/create",
        "address": config.orders_create_webhook_endpoint,
        "format": "json"
      }
    }, (err, data) => {
      console.log('order create', err, data);
    });    

    var p3 =  Shopify.post(`/admin/api/${process.env.SHOPIFY_API_VERSION}/webhooks.json`, {
      "webhook": {
        "topic": "orders/updated",
        "address": config.orders_updated_webhook_endpoint,
        "format": "json"
      }
    }, (err) => {
      console.log('order updated', err, data);
    });  

    var p4 =  Shopify.post(`/admin/api/${process.env.SHOPIFY_API_VERSION}/webhooks.json`, {
      "webhook": {
        "topic": "orders/edited",
        "address": config.orders_edited_webhook_endpoint,
        "format": "json"
      }
    }, (err, data) => {
      console.log('order edited', err, data);
    });  

    var p5 =  Shopify.post(`/admin/api/${process.env.SHOPIFY_API_VERSION}/webhooks.json`, {
      "webhook": {
        "topic": "orders/cancelled",
        "address": config.orders_cancelled_webhook_endpoint,
        "format": "json"
      }
    }, (err, data) => {
      console.log('order cancelled', err, data);
    });     

    var p6 = Shopify.post(`/admin/api/${process.env.SHOPIFY_API_VERSION}/webhooks.json`, {
      "webhook": {
        "topic": "products/delete ",
        "address": config.products_delete_webhook_endpoint,
        "format": "json"
      }
    }, (err, data) => {
      console.log('order cancelled', err, data);
    });   

    Promise.all([p1, p2, p3, p4, p5, p6]).then(() => {
      console.log('registered all webhooks');

      res.redirect('/?' + querystring.stringify(req.query));
    })
  });
});

module.exports = router;
