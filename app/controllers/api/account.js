const router = require('express').Router();
const { ObjectID } = require('mongodb');
const config = require(_base + 'app/config/config');
const _ = require('lodash');
const StoreModel = require(_base+'app/models/stores');
const moment = require('moment');
const plans = require(_base + 'app/config/plans');
const Shopify = require('shopify-api-node');

router.get('/', async function (req, res) {
    console.log('In Account Plan Page');

    const storeModel = new StoreModel(req, res);
    const store = await storeModel.get({
        _id: ObjectID(req.auth_store._id)
    });    
    const shopify = new Shopify({
        shopName: store.domain,
        accessToken: store.access_token,
        apiVersion: '2021-01'
    });


    //get shop plan via api
    var currentShopPlan = await shopify.shop.get().then((res) => {
        return res.plan_name;
    })

    // skip validation for development stores
    if (currentShopPlan == 'affiliate' || currentShopPlan == 'partner_test') {
        var canUse = true;
    }

    //filter plan
    const suitablePlans = _.filter(plans, function(p) {
        return p.shopifyPlan.includes(currentShopPlan);
    });
    
    const currentPlan = await storeModel.getCurrentPlan();
    const trialEndsOn = await storeModel.trialEndsOn(currentPlan);
    const inTrial = await storeModel.inTrial(currentPlan);

    const discountTypeTitles = {
        tiered: 'VIP Tiered Discount',
        crosssell: 'Upsell / Cross-sell',
        quantity: 'Quantity Discount'
    };
    let discountTypes = [];
    for(let key in discountTypeTitles){
        let title = discountTypeTitles[key];
        let type = {
            key,
            title,
        }
        type.status = (inTrial || await storeModel.canUse(key) || canUse)
        discountTypes.push(type);
    }


    return res.json({
        suitablePlans,
        currentPlan,
        inTrial,
        trialEndsOn,
        discountTypes
    });


});

router.get('/plans', function (req, res) {
    return res.json(plans);
});

router.post('/plan', async function (req, res) {
    console.log('Activate Plan...');
    const {code} = req.body;
    const plan = _.find(plans, {code: code});

    let testMode = process.env.mode == 'dev' ? true : null; 

    const charge = await req.shopify.recurringApplicationCharge.create({
        name: plan.code,
        price: plan.monthlyPrice,
        return_url: config.host + '/account?shop=' + req.auth_store.domain,
        trial_days: 7,
        test: testMode,
    })

    return res.json(charge);
});

module.exports = router;