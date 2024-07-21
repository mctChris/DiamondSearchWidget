const Model = require(_base + 'app/models/model');
const plans = require(_base + 'app/config/plans');
const moment = require('moment');
const _ = require('lodash')
class Stores extends Model {
  constructor(req, res) {
    super(req, res, 'stores');

    this.schema = {
      domain: {
        title: 'Domain',
        type: 'text',
        is_required: true
      },
      access_token: {
        title: 'Access Token',
        type: 'text',
        is_required: true
      },
      nonce: {
        title: 'Nonce',
        type: 'text',
        is_required: true
      },
    };

    this.load_standard_schema(true);
  }

  async getCurrentPlan() {
    const charges = await this.req.shopify.recurringApplicationCharge.list();

    // const storeModel = new StoreModel(req, res);
    let activeCharge = _.find(charges, { status: 'active' });
    if (activeCharge) {
      activeCharge.details = _.find(plans, { code: activeCharge.name });
    } else {
      activeCharge = false;
    }

    return activeCharge;
  }
  
  async trialEndsOn(currentPlan) {
      // return moment(this.req.auth_store.created_at).add(7, 'days');
      return moment(currentPlan.trial_ends_on);
  }

  async inTrial(currentPlan) {
    if(typeof currentPlan == 'undefined'){
      currentPlan = await this.getCurrentPlan();
    }

    let trialEndsOn = moment(currentPlan.trial_ends_on);

    // return this.trialEndsOn().isAfter(moment());
    return trialEndsOn.isAfter(moment());
  }

  async canUse(discountType, currentPlan) {
    if(typeof currentPlan == 'undefined'){
      currentPlan = await this.getCurrentPlan();
    }

    if(await this.inTrial(currentPlan)){
      return true;
    }

    if(!currentPlan){
      return false;
    }

    console.log('can use', _.includes(currentPlan.details.scopes, discountType))

    return _.includes(currentPlan.details.scopes, discountType);

  }


}

module.exports = Stores;
