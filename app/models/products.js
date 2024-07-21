const Model = require(_base+'app/models/model');

class Products extends Model {
  constructor(req, res) {
    super(req, res, 'products');

    this.schema = {
      category: {
        title: 'Category',
        type: 'relation',
        foreign: 'categories',
        foreign_label: 'title',
        is_multiple: true,
        is_required: true
      },
      title: {
        title: 'Title',
        type: 'text',
        is_required: true
      },
      email: {
        title: 'Email',
        type: 'email',
        is_required: true
      },
      url: {
        title: 'URL',
        type: 'url',
      },
      description: {
        title: 'Description',
        type: 'textarea'
      },
      editor: {
        title: 'Editor',
        type: 'editor'
      },
      date: {
        title: 'Date',
        type: 'date'
      },
      datetime: {
        title: 'Datetime',
        type: 'date'
      },
      checkbox: {
        title: 'True / False',
        type: 'boolean'
      },
      colorpicker: {
        title: 'Color',
        type: 'text'
      },
      number: {
        title: 'Number',
        type: 'number'
      },
      select: {
        title: 'Select',
        type: 'select', 
        values: {
          1: 'Hong Kong, Macau',
          2: 'USA',
          33: 'China',
        }
      },
      select2: {
        title: 'Select 2',
        type: 'select', 
        is_multiple: true,
        values: {
          1: 'Hong Kong, Macau',
          2: 'USA',
          33: 'China',
          44: 'Taiwan'
        }
      },
      table: {
        title: 'Table',
        type: 'table',
        values: {
          'title': 'Title', 
          'description': 'Description', 
          'price': 'Price'
        }
      },
      image1: {
        title: 'Single Image',
        type: 'upload',
        accept: 'image/*',
        is_public: true,
      },
      image_secure: {
        title: 'Single Secure Image',
        type: 'upload',
        accept: 'image/*',
      },
      image2: {
        title: 'Multiple Images',
        type: 'upload',
        accept: 'image/*',
        is_public: true,
        is_multiple: true
      },
    };

    this.load_standard_schema(true);
  }
}

module.exports = Products;
