var router = require('express').Router();
var { ObjectID } = require('mongodb');
var DiamondModel = require(_base + 'app/models/diamonds');
var config = require(_base + '/app/config/config');
var _ = require('lodash')
var Shopify = require('shopify-api-node');
var moment = require('moment');
var crypto = require('crypto')
var getRawBody = require('raw-body')
var bodyParser = require('body-parser');
var nodemailer = require('nodemailer');

// Webhooks
router.use(async (req, res, next) => {
    console.log('Webhook heard!')
    // Verify
    var hmac = req.header('X-Shopify-Hmac-Sha256');
    var topic = req.header('X-Shopify-Topic');
    var shop = req.header('X-Shopify-Shop-Domain');

    var verified = verifyWebhook(req.rawBody, hmac);

    if (!verified) {
        console.log('Failed to verify the incoming request.')
        res.status(401).send('Could not verify request.');
        return;
    }

    req.shopify = new Shopify({
        shopName: process.env.SHOP,
        accessToken: config.accessToken,
        apiVersion: process.env.SHOPIFY_API_VERSION,
        autoLimit: {
            calls: 2,
            interval: 2000,
            bucketSize: 35
        },
        timeout: 240000
    });

    req.Diamonds = new DiamondModel(req, res);

    next();

});

function verifyWebhook(payload, hmac) {
    var message = String(payload);
    var genHash = crypto
        .createHmac('sha256', config.shopify_api_secret)
        .update(message)
        .digest('base64');
    return genHash === hmac;
}

router.post('/products_update', async function(req, res) {
    console.log('product updated');
    var record = await req.Diamonds.get({
        shopify_id: req.body.id
    });
    if (!record) return res.sendStatus(200);

    var update_db = await req.Diamonds.update(
            {shopify_id: req.body.id},
            {
                shopify_price: req.body.variants[0].price,
                shopify_compare_at_price: req.body.variants[0].compare_at_price,
                shopify_status: req.body.status
            }
        )

    return res.sendStatus(200);
})

router.post('/products_delete', async function(req, res) {
    console.log('product delete', req.body);

    var record = await req.Diamonds.get({
        shopify_id: req.body.id
    });

    if (!record) return res.sendStatus(200);

    var delete_in_db = await req.Diamonds.delete({
        shopify_id: req.body.id
    });

    return res.sendStatus(200);
})

router.post('/orders_create', async function(req, res) {
    console.log('order created');
    return res.sendStatus(200);
})

router.post('/orders_updated', async function(req, res) {
    console.log('order updated');
    return res.sendStatus(200);
})

router.post('/orders_edited', async function(req, res) {
    console.log('order edited');
    return res.sendStatus(200);
})

router.post('/orders_cancelled', async function(req, res) {
    console.log('order cancelled');
    return res.sendStatus(200);
})

router.post('/customer_redact', function(req, res) {
    return res.sendStatus(200);
});

router.post('/customer_data_request', function(req, res) {
    return res.sendStatus(200);
});

router.post('/shop_data_erasure', function(req, res) {
    return res.sendStatus(200);
});

module.exports = router;