module.exports = {
  random_string: function(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  },
  object_map_key: function(values) {
    let results = {};
    for (let i = 0; i < values.length; i++) {
      if (typeof values[i] == 'object')
        results[values[i]._id] = values[i];
    }

    return results;
  },
  set_excel_cell: function(ws, cell, to, value, border) {
    ws.getCell(cell).value = value;

    let border_object = {};

    if (border[0]==1)
      border_object.top = {style: 'thin'};
    else if (border[0]==2)
      border_object.top = {style: 'medium'};

    if (border[1]==1)
      border_object.right = {style: 'thin'};
    else if (border[1]==2)
      border_object.right = {style: 'medium'};

    if (border[2]==1)
      border_object.bottom = {style: 'thin'};
    else if (border[2]==2)
      border_object.bottom = {style: 'medium'};

    if (border[3]==1)
      border_object.left = {style: 'thin'};
    else if (border[3]==2)
      border_object.left = {style: 'medium'};

    ws.getCell(cell).border = border_object
    ws.mergeCells(cell + ':' + to);
  }
}
