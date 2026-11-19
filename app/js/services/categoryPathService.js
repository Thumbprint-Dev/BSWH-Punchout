// Breadcrumb trail for a category: its ancestor chain in the nav tree ($scope.tree, loaded in
// Four51Ctrl.js), top level first and ending with the category itself. Used by the category page
// (categoryView.html) and, through ProductCtrl.categoryPath, the product page's breadcrumb.
// Searches every level, however deep the catalog goes. Returns [] when the category isn't in the
// tree (or the tree hasn't loaded yet). The Featured and All Products utility categories are left
// out, as they are in the nav; InteropIDs are unique platform-wide, so those may carry a suffix
// (e.g. "featured-gp") and are matched by prefix.
four51.app.factory('CategoryPath', ['AppConst', function(AppConst) {
	function startsWith(id, prefix) {
		return !!id && !!prefix && id.toLowerCase().indexOf(prefix.toLowerCase()) === 0;
	}

	function isUtility(cat) {
		return startsWith(cat.InteropID, AppConst.featuredCategoryInteropID) ||
			startsWith(cat.InteropID, AppConst.allProductsCategoryInteropID);
	}

	function find(categories, id) {
		for (var i = 0; categories && i < categories.length; i++) {
			var cat = categories[i];
			if ((cat.InteropID || '').toLowerCase() === id) return [cat];
			var below = find(cat.SubCategories, id);
			if (below) return [cat].concat(below);
		}
		return null;
	}

	return {
		get: function(tree, interopID) {
			if (!tree || !interopID) return [];
			var path = find(tree, interopID.toLowerCase());
			return path ? path.filter(function(cat) { return !isUtility(cat); }) : [];
		}
	};
}]);
