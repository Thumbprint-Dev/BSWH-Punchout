four51.app.controller('Four51Ctrl', ['$scope', '$route', '$rootScope', '$timeout', '$document', '$window', '$location', '$451', 'User', 'Order', 'Security', 'OrderConfig', 'Category', 'AppConst','XLATService', 'GoogleAnalytics', 'FavoriteProducts', 'SiteConfig', 'publicRoutes', 'ComingSoon', 'PriceNotes', 'ComparePricing', 'Punchout',
function ($scope, $route, $rootScope, $timeout, $document, $window, $location, $451, User, Order, Security, OrderConfig, Category, AppConst, XLATService, GoogleAnalytics, FavoriteProducts, SiteConfig, publicRoutes, ComingSoon, PriceNotes, ComparePricing, Punchout) {
	$scope.AppConst = AppConst;
	// Punchout (punchoutService.js): the session cookie Four51 sets when a buyer punches in.
	// PunchoutUser is set below, once the user loads, from the PunchoutUser permission.
	$scope.PunchoutSession = Punchout.punchoutSession;
	// On $root, like the favorites helpers below: the product card partial is ng-included, and a
	// child scope there can't shadow a $root property.
	$scope.$root.comingSoon = ComingSoon;
	// Cart and checkout order summaries read site.json price notes through this (priceNoteService.js).
	$scope.$root.priceNotes = PriceNotes;
	// Retail prices and order savings from site.json comparePricing (comparePricingService.js).
	$scope.$root.comparePricing = ComparePricing;
	// This controller sits on <html>, so every view and directive below it -- the
	// nav logo, the home hero -- reads site.json off the inherited `site` object.
	$scope.site = SiteConfig.settings;
	$scope.scroll = 0;
	$scope.isAnon = $451.isAnon; //need to know this before we have access to the user object
	$scope.Four51User = Security;
	// This used to auto-provision a guest (TempCustomer) session for ANY unauthenticated page
	// load, regardless of destination - so a logged-out shopper landing on, say, /catalog would
	// silently become a guest and see the storefront instead of being asked to log in. Now it
	// only does that on the routes meant to be reachable without an account (the same list
	// AnonRouter already treats as public); anything else goes straight to /login.
	if ($451.isAnon && !Security.isAuthenticated()) {
		var currentRoute = $location.path().replace(/^\/+/, '').split('/')[0];
		if (publicRoutes.indexOf(currentRoute) > -1) {
			var tempUser = {
				Username: null,
				Password: null,
				Email: null
			};
			User.login(tempUser,function (u) {
				location.reload();
			});
		} else {
			$location.path('/login');
		}
	}

	// fix Bootstrap fixed-top and fixed-bottom from jumping around on mobile input when virtual keyboard appears
	if ($(window).width() < 960) {
		$(document)
			.on('focus', ':input:not("button")', function (e) {
				$('.navbar-fixed-bottom, .headroom.navbar-fixed-top').css("position", "relative");
			})
			.on('blur', ':input', function (e) {
				$('.navbar-fixed-bottom, .headroom.navbar-fixed-top').css("position", "fixed");
			});
	}

	function init() {
		if (Security.isAuthenticated()) {
			User.get(function (user) {
				$scope.user = user;
				$scope.user.Culture.CurrencyPrefix = XLATService.getCurrentLanguage(user.CultureUI, user.Culture.Name)[1];
				$scope.user.Culture.DateFormat = XLATService.getCurrentLanguage(user.CultureUI, user.Culture.Name)[2];

				if (user.Company && user.Company.Name) {
					$document[0].title = user.Company.Name + ' - ' + $window.location.hostname;
				}

				if (!$scope.user.TermsAccepted)
					$location.path('conditions');

				// Punchout. PunchoutUser is resolved on every load: it drives the cart's Submit cart
				// button and hides checkout and Log Out. The landing redirect runs once per punchout
				// session. The live BSWH copy stored a plain 'true', so a session closed without
				// submitting skipped the landing on every later punch-in; keying on the session's
				// PunchoutBuyerCookie lets each new session land. It waits for terms to be accepted.
				$scope.PunchoutUser = user.Permissions.contains('PunchoutUser');
				var session = $scope.PunchoutSession;
				var landingKey = (session && session.PunchoutBuyerCookie) || 'landed';
				if ($scope.PunchoutUser && $scope.user.TermsAccepted && store.get('punchoutconfig') !== landingKey) {
					if (session && session.PunchOutOperation == 'Edit') $location.path('cart');
					else if (session && session.PunchoutLandingCategory) $location.path('catalog/' + session.PunchoutLandingCategory);
					else if (session && session.PunchoutLandingProduct) $location.path('product/' + session.PunchoutLandingProduct);
					store.set('punchoutconfig', landingKey);
				}
				// Punchout orders are finished in the procurement system, so checkout is off limits
				// even by typed URL or a bookmark; the cart's Submit cart is the way out.
				if ($scope.PunchoutUser && /^\/checkout(\/|$)/.test($location.path()))
					$location.path('cart');

				if (user.CurrentOrderID) {
					Order.get(user.CurrentOrderID, function (ordr) {
						$scope.currentOrder = ordr;
						OrderConfig.costcenter(ordr, user);
					});
				}
				else
					$scope.currentOrder = null;

				if (user.Company.GoogleAnalyticsCode) {
					GoogleAnalytics.analyticsLogin(user.Company.GoogleAnalyticsCode);
				}

			});
			Category.tree(function (data) {
				$scope.tree = data;
				ComingSoon.load(data);
				$scope.$broadcast("treeComplete", data);
			});

			// Favoriting helpers live on $scope.$root, not $scope: directives like the
			// mtProductCard partial's ng-include create child scopes that would shadow a
			// plain $scope property, so every template that renders a heart button reads
			// through $root instead.
			$scope.$root.favoriteProducts = $scope.$root.favoriteProducts || [];
			FavoriteProducts.getAll(function (skus) {
				$scope.$root.favoriteProducts = skus;
			});
			$scope.$root.addFavorite = function (sku) {
				FavoriteProducts.add(sku, function (skus) {
					$scope.$root.favoriteProducts = skus;
				});
			};
			$scope.$root.removeFavorite = function (sku) {
				FavoriteProducts.remove(sku, function (skus) {
					$scope.$root.favoriteProducts = skus;
				});
			};
			$scope.$root.isFavorite = function (sku) {
				return $scope.$root.favoriteProducts.indexOf(sku) > -1;
			};
		}
	}

	try {
		trackJs.configure({
			trackAjaxFail: false
		});
	}
	catch(ex) {}

	$scope.errorSection = '';

	function cleanup() {
		Security.clear();
	}

	$scope.$on('event:auth-loginConfirmed', function(){
		$route.reload();
	});
	$scope.$on("$routeChangeSuccess", init);
	$scope.$on('event:auth-loginRequired', cleanup);

	// $scope.currentOrder is set here (init(), above) and inherited by every other controller
	// via the normal prototypal scope chain - navCtrl.js is the one exception, since <navigation>
	// gets its own controller scope as a SIBLING of ng-view, not a descendant of it. Any update
	// navCtrl.js made directly to "$scope.currentOrder" (e.g. removing a mini-cart item) was only
	// ever shadowing nav's own local copy - the real value here, that every other page actually
	// reads, never changed. A category-page add-to-cart right after a mini-cart removal then sent
	// the server a stale order (still referencing an already-deleted line item, or a deleted
	// order's now-invalid ID), which came back as a raw "Object reference not set to an instance
	// of an object" exception. Order.deletelineitem/save/etc. already broadcast this event on
	// every mutation (orderService.js's _then helper) - listening for it HERE, on the scope that
	// actually owns currentOrder, is what makes every other page see the update too. Guarded by
	// CurrentOrderID so an approver opening someone else's order (Order History) never overwrites
	// this shopper's own cart.
	$scope.$on('event:orderUpdate', function(event, order) {
		if (!order || order.Status != 'Unsubmitted') {
			if (!order || ($scope.currentOrder && order.ID === $scope.currentOrder.ID))
				$scope.currentOrder = null;
			return;
		}
		if ($scope.user && order.ID === $scope.user.CurrentOrderID) {
			$scope.currentOrder = order;
		}
	});

	// Timeout timer value
	var TimeOutTimerValue = 30*60*1000;

	// Start a timeout
	var TimeOut_Thread = $timeout(function(){ LogoutByTimer() } , TimeOutTimerValue);
	var bodyElement = angular.element($document);

	angular.forEach(['keydown', 'keyup', 'click', 'mousemove', 'DOMMouseScroll', 'mousewheel', 'mousedown', 'touchstart', 'touchmove', 'scroll', 'focus'],
		function(EventName) {
			bodyElement.bind(EventName, function (e) { TimeOut_Resetter(e) });
		});

	// Same destination as the Log Out menu item (navCtrl): a session dropped on
	// the idle timer and left sitting on the page is the same broken-looking
	// state, and more confusing for not having been asked for.
	function LogoutByTimer(){
		// A punchout session belongs to the buyer's procurement system, which has no way to
		// sign back in here; the live BSWH copy removed this timer for the same reason.
		if ($scope.PunchoutSession || $scope.PunchoutUser) return;

		function goToLogin() {
			$window.location.href = '/' + $451.apiName + '/login';
		}

		User.logout($scope.user, goToLogin, function(ex){
			console.log(ex.Message);
			goToLogin();
		});
	}

	function TimeOut_Resetter(e){
		/// Stop the pending timeout
		$timeout.cancel(TimeOut_Thread);

		/// Reset the timeout
		TimeOut_Thread = $timeout(function(){ LogoutByTimer() } , TimeOutTimerValue);
	}
}]);