// Punchout from a buyer's procurement system (Ariba, Coupa and the like), from Four51's
// Punchout overrides (Four51/CustomSolutions/Punchout); same API as the live BSWH copy.
// Four51 sets the punchoutSession.<app> cookie when a punchout session starts. It carries
// PunchOutPostURL (where the cart goes back to), PunchoutTemplateName, PunchoutBuyerCookie,
// PunchOutOperation ('Create' or 'Edit') and the optional landing category or product.
four51.app.factory('Punchout', ['$resource', '$451', '$cookieStore', 'Error', function($resource, $451, $cookieStore, Error) {
    function _then(fn, data) {
        if (angular.isFunction(fn))
            fn(data);
    }

    var _punchoutSession = $cookieStore.get('punchoutSession.' + $451.apiName);

    // The cXML/OCI fields to post back to the buyer's PunchOutPostURL.
    var _getForm = function(success, error) {
        if (!_punchoutSession) {
            _then(error, { Message: 'Your punchout session has ended. Return to your purchasing system and punch out again.' });
            return;
        }
        var url = $451.api('punchoutin/returnform/' + _punchoutSession.PunchoutTemplateName) + '?PunchoutBuyerCookie=' + _punchoutSession.PunchoutBuyerCookie;
        $resource(url).get().$promise.then(
            function(form) {
                _then(success, form);
            },
            function(ex) {
                _then(error, Error.format(ex));
            }
        );
    };

    // Marks the order as a punchout order before its return form is fetched.
    var _save = function(id, success, error) {
        $resource($451.api('order/punchout/:id'), { 'id': id }, { submitpunchout: { method: 'PUT' } }).submitpunchout().$promise.then(
            function() {
                _then(success);
            },
            function(ex) {
                _then(error, Error.format(ex));
            }
        );
    };

    return {
        getForm: _getForm,
        punchoutSession: _punchoutSession,
        save: _save
    };
}]);
