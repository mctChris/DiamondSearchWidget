module.exports = {
    lists_key_convert: function(model, query) {
        let where = {}, option = {};
        for (let key in query) {
            if (key == 'pageIndex' || key == 'pageSize' || key == 'sortField' || key == 'sortOrder' || key == 'pageCount') {
                option[key] = query[key];
            } else if (query[key]) {
                let temp = model.field_filter(key, query[key]);
                if (temp) where[key] = temp;
            }
        }

        return {where, option};
    }
}