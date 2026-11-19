// Inline design panel for variable (VariableText) products on the product page. Replaces the old
// flow - a list of saved designs, then a separate spec-form page (specform.hcf) to create or edit
// one - with a card on the product page itself:
//   1. Design: "Create new" shows the product's design fields; "Choose previous design" lists the
//      shopper's saved designs, each with "Use this design" and (for their own) a trash can.
//   2. Review proof: after saving, the proof shows on the left (productLightbox.js) and the card
//      sums up the design, with a checkbox standing in for the product's review-proof spec.
//   3. Add to cart: the PDT's own quantity + Add To Cart, styled as the foot of this card.
//
// Which fields show, and in what order, still comes from the product's own spec form in the Four51
// admin: the panel fetches specform.hcf for the product and lifts out its field elements
// (customtextfield, customselectionfield, ocmaskfield, ...), then compiles each one against a
// working copy of the design. So every product keeps its admin-chosen fields and Four51's own
// field behaviour (defaults, masks, "Other" values, validation) - this only lays them out.
//
// Layout: a 6-column grid. Text fields are half width; ones limited to 10 characters or fewer are
// narrow and sit beside the field before them; long labels, dropdowns and anything else are full
// width; each row's spare space goes to its last wide field. Text fields limited to 100
// characters or fewer show a character counter. A dropdown with one real option hides Four51's
// automatic "Other" choice (Allow Other Value), since there's nothing to choose between.
//
// Saving creates the design (Variant.save) and opens /product/:id/:variantID, the same page the
// old spec form went to. Used by the ModernTheme PDT only where ProductCtrl.useDesigner() says so;
// cart and approval edits keep the old spec-form page.
four51.app.directive('variabledesigner', ['$http', '$templateCache', '$location', '$route', '$timeout', 'Variant',
function($http, $templateCache, $location, $route, $timeout, Variant) {
	// Which tab was open, carried across the reload after deleting a design.
	var remembered = { product: null, mode: null };
	var SPEC_REF = /^\s*Variant\.Specs\.([A-Za-z0-9_\-]+)\s*$/;

	function isOther(option) {
		return !!option && String(option.ID || '').indexOf('_other') > -1;
	}

	// The field elements of a spec form, in order, as bare tags (attributes only - children are
	// dropped, so a field written self-closing can't drag its siblings along with it).
	function parseSpecForm(html) {
		var doc = document.implementation.createHTMLDocument('');
		doc.body.innerHTML = html || '';
		var fields = [];
		angular.forEach(doc.body.querySelectorAll('[customfield], [spec1]'), function(el) {
			var match = SPEC_REF.exec(el.getAttribute('customfield') || el.getAttribute('spec1') || '');
			if (!match) return;
			var tag = el.tagName.toLowerCase();
			var attrs = [];
			angular.forEach(el.attributes, function(a) {
				attrs.push(a.name + '="' + a.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"');
			});
			fields.push({
				name: match[1],
				tag: tag,
				label: el.getAttribute('label') || '',
				html: '<' + tag + ' ' + attrs.join(' ') + '></' + tag + '>'
			});
		});
		return fields;
	}

	function labelOf(field, spec) {
		return field.label || (spec && (spec.Label || spec.Name)) || field.name;
	}

	function isShortText(field, spec) {
		return field.tag === 'customtextfield' && spec.ControlType === 'Text' && !(spec.Lines > 1);
	}

	function baseSpan(field, spec) {
		if (isShortText(field, spec)) {
			if (spec.MaxLength > 0 && spec.MaxLength <= 10) return 2;
			return labelOf(field, spec).length > 30 ? 6 : 3;
		}
		if (field.tag === 'ocmaskfield' || field.tag === 'customphonefield') return 3;
		return 6;
	}

	// Rows of 6 columns. A narrow field joins the field before it; spare columns go to the row's
	// last field that isn't narrow.
	function layout(fields) {
		var row = [], used = 0;
		function close() {
			if (!row.length) return;
			var spare = 6 - used;
			if (spare > 0) {
				var target = row[row.length - 1];
				for (var i = row.length - 1; i >= 0; i--) {
					if (row[i].span > 2) { target = row[i]; break; }
				}
				target.span += spare;
			}
			row = [];
			used = 0;
		}
		angular.forEach(fields, function(f) {
			if (used + f.span > 6) {
				if (f.span <= 2 && row.length > 1) {
					var previous = row.pop();
					used -= previous.span;
					close();
					row = [previous];
					used = previous.span;
				}
				else close();
			}
			row.push(f);
			used += f.span;
			if (used === 6) close();
		});
		close();
		return fields;
	}

	return {
		restrict: 'E',
		scope: false,
		templateUrl: 'partials/controls/variableDesigner.html',
		link: function(scope, element) {
			var design = scope.design = {
				active: false,
				mode: 'new',
				editing: false,
				working: null,
				fields: [],
				summary: [],
				loading: false,
				failed: false,
				saving: false,
				submitted: false,
				error: null,
				confirmDelete: null,
				deleting: null,
				previews: {},
				proof: null,
				proofChecked: false,
				orderSpecs: {},
				hasOrderSpecs: false
			};
			var templateFields = null;
			var templateFor = null;
			var modeChosen = false;

			function product() {
				return scope.LineItem && scope.LineItem.Product;
			}

			function productPath(variantID) {
				return '/product/' + product().InteropID + (variantID ? '/' + variantID : '');
			}

			function go(path) {
				if ($location.path() === path) $route.reload();
				else $location.path(path);
			}

			// Four51 sends "null" for an empty user-field default (Case #124640, as in SpecFormCtrl),
			// and a one-option dropdown keeps its "Other" only when that's what the design holds.
			function prepare(variant) {
				angular.forEach(variant.Specs, function(s) {
					if (s.Value === 'null') s.Value = '';
					if (s.ControlType !== 'Selection' || !s.Options) return;
					var real = s.Options.filter(function(o) { return !isOther(o); });
					var holdsReal = !s.Value || real.some(function(o) { return o.Value === s.Value; });
					if (real.length === 1 && real.length < s.Options.length && holdsReal) {
						s.$$mtAllOptions = s.Options;
						s.Options = real;
					}
				});
				return variant;
			}

			function newDesign() {
				var p = product();
				var variant = { ProductInteropID: p.InteropID, Specs: {} };
				angular.forEach(p.Specs, function(s) {
					if (!s.CanSetForLineItem) variant.Specs[s.Name] = angular.copy(s);
				});
				return prepare(variant);
			}

			function payload(asNew) {
				var variant = angular.copy(design.working);
				angular.forEach(design.working.Specs, function(s, name) {
					if (s.$$mtAllOptions) variant.Specs[name].Options = angular.copy(s.$$mtAllOptions);
				});
				if (asNew) variant.InteropID = null;
				return variant;
			}

			function render() {
				if (!templateFields) return;
				var fields = [];
				if (design.working) {
					angular.forEach(templateFields, function(f) {
						var spec = design.working.Specs[f.name];
						if (!spec) return;
						fields.push({
							name: f.name,
							html: f.html,
							label: labelOf(f, spec),
							span: baseSpan(f, spec),
							counter: isShortText(f, spec) && spec.MaxLength > 0 && spec.MaxLength <= 100 ? spec.MaxLength : 0
						});
					});
				}
				design.fields = layout(fields);

				var summary = [];
				var saved = scope.LineItem.Variant;
				if (saved && saved.Specs) {
					angular.forEach(templateFields, function(f) {
						var spec = saved.Specs[f.name];
						if (spec && spec.Value && String(spec.Value) !== 'null' && summary.length < 8)
							summary.push({ label: labelOf(f, spec), value: spec.Value });
					});
				}
				design.summary = summary;
			}

			function loadForm() {
				var p = product();
				if (templateFor === p.InteropID) return render();
				templateFor = p.InteropID;
				templateFields = null;
				design.loading = true;
				design.failed = false;
				$http.get('specform.hcf?id=' + encodeURIComponent(p.InteropID), { cache: $templateCache }).then(function(res) {
					templateFields = parseSpecForm(res.data);
					design.loading = false;
					design.failed = !templateFields.length;
					render();
				}, function() {
					design.loading = false;
					design.failed = true;
				});
			}

			// The product's review-proof line-item spec, if it has one: a dropdown whose name or
			// label mentions "proof" with an answer starting "Yes". The checkbox sets that answer.
			function findProof() {
				var found = null;
				angular.forEach(scope.LineItem.Specs, function(s) {
					if (found || s.ControlType !== 'Selection' || !s.Options) return;
					if (!/proof/i.test((s.Name || '') + ' ' + (s.Label || ''))) return;
					var yes = s.Options.filter(function(o) { return /^\s*yes\b/i.test(o.Value || ''); })[0];
					if (yes) found = { spec: s, yes: yes };
				});
				return found;
			}

			function loadPreviews() {
				angular.forEach(product().Variants, function(v) {
					if (!v || !v.InteropID || design.previews[v.InteropID] !== undefined) return;
					var known = scope.variantLineItems && scope.variantLineItems[v.InteropID];
					if (known && known.Variant && known.Variant.PreviewUrl) {
						design.previews[v.InteropID] = known.Variant.PreviewUrl;
						return;
					}
					design.previews[v.InteropID] = null;
					Variant.get({ ProductInteropID: product().InteropID, VariantInteropID: v.InteropID }, function(data) {
						design.previews[v.InteropID] = data.PreviewUrl || null;
					});
				});
			}

			function init() {
				var p = product();
				design.active = !!(p && angular.isFunction(scope.useDesigner) && scope.useDesigner());
				if (!design.active) return;

				if (!modeChosen) {
					modeChosen = true;
					if (remembered.product === p.InteropID && remembered.mode) design.mode = remembered.mode;
					else design.mode = scope.canCreateVariant === false ? 'previous' : 'new';
					remembered.product = remembered.mode = null;
				}
				design.editing = false;
				design.error = null;
				design.confirmDelete = null;

				design.proof = findProof();
				design.proofChecked = !!(design.proof && design.proof.spec.Value === design.proof.yes.Value);
				var orderSpecs = {};
				angular.forEach(scope.LineItem.Specs, function(s, name) {
					if (!design.proof || s !== design.proof.spec) orderSpecs[name] = s;
				});
				design.orderSpecs = orderSpecs;
				design.hasOrderSpecs = Object.keys(orderSpecs).length > 0;

				design.working = scope.LineItem.Variant ? null : newDesign();
				if (design.mode === 'previous') loadPreviews();
				loadForm();
			}

			design.showNew = function() {
				design.mode = 'new';
				design.error = null;
			};

			design.showPrevious = function() {
				design.mode = 'previous';
				design.error = null;
				loadPreviews();
			};

			design.edit = function() {
				design.working = prepare(angular.copy(scope.LineItem.Variant));
				design.editing = true;
				design.submitted = false;
				design.error = null;
				render();
				$timeout(function() {
					if (element[0].scrollIntoView) element[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
				});
			};

			design.cancelEdit = function() {
				design.editing = false;
				design.error = null;
				design.working = null;
				render();
			};

			// Designs an admin set up can't be changed by the shopper, only copied.
			design.canUpdate = function() {
				return !!(design.editing && scope.LineItem.Variant && scope.LineItem.Variant.IsMpowerVariant);
			};

			design.save = function(asNew) {
				design.submitted = true;
				design.error = null;
				var missing = [];
				angular.forEach(design.fields, function(f) {
					var s = design.working.Specs[f.name];
					if (s && s.Required && !s.Value) missing.push(f.label);
				});
				if (missing.length) {
					design.error = 'Please fill in ' + missing.join(', ') + '.';
					return;
				}
				design.saving = true;
				Variant.save(payload(asNew || (design.editing && !design.canUpdate())), function(data) {
					design.saving = false;
					go(productPath(data.InteropID));
				})['catch'](function(ex) {
					design.saving = false;
					var data = ex && ex.data;
					design.error = (data && (data.Message || data.Detail)) || 'Your design couldn\'t be saved. Please try again.';
				});
			};

			design.use = function(v) {
				$location.path(productPath(v.InteropID));
			};

			design.remove = function(v) {
				if (!v.IsMpowerVariant) return;
				design.error = null;
				design.deleting = v.InteropID;
				Variant['delete']({ ProductInteropID: product().InteropID, InteropID: v.InteropID }, function() {
					design.deleting = null;
					design.confirmDelete = null;
					if (scope.LineItem.Variant && scope.LineItem.Variant.InteropID === v.InteropID) {
						$location.path(productPath());
					} else {
						remembered.product = product().InteropID;
						remembered.mode = design.mode;
						$route.reload();
					}
				}, function(ex) {
					design.deleting = null;
					design.error = (ex && ex.Message) || 'That design couldn\'t be deleted. Please try again.';
				});
			};

			design.setProof = function(checked) {
				var proof = design.proof;
				if (!proof) return;
				angular.forEach(proof.spec.Options, function(o) { o.Selected = false; });
				if (checked) {
					proof.spec.Value = proof.yes.Value;
					proof.spec.SelectedOptionID = proof.yes.ID;
					proof.yes.Selected = true;
				} else {
					proof.spec.Value = null;
					proof.spec.SelectedOptionID = null;
				}
			};

			design.proofPending = function() {
				return !!(design.active && design.proof && design.proof.spec.Value !== design.proof.yes.Value);
			};

			// 'done', 'on' or '' for step 1 (design), 2 (review proof) and 3 (add to cart).
			design.step = function(n) {
				var designing = !scope.LineItem.Variant || design.editing;
				if (n === 1) return designing ? 'on' : 'done';
				if (designing) return '';
				if (n === 2) return design.proofPending() ? 'on' : 'done';
				return design.proofPending() ? '' : 'on';
			};

			scope.$watch('LineItem.Product', function(p) {
				if (p) init();
			});
		}
	};
}]);

// One design field: compiles a field element lifted from the product's spec form against the
// design being edited (its markup refers to "Variant.Specs.<name>").
four51.app.directive('mtvfield', ['$compile', function($compile) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			var field = scope.$eval(attrs.mtvfield);
			if (!field) return;
			var child = scope.$new();
			child.Variant = scope.design.working;
			element.html(field.html);
			$compile(element.contents())(child);
		}
	};
}]);

// The product's order-time fields (addToOrderSpecForm.hcf), minus the review-proof spec the
// design panel shows as a checkbox. The form lists LineItem.Specs, so it's given a LineItem whose
// Specs leave that one out - the spec objects themselves are shared, so values still land on the
// real line item.
four51.app.directive('mtvorderspecs', [function() {
	return {
		restrict: 'E',
		scope: true,
		template: '<div ng-include="mtvSpecForm"></div>',
		link: function(scope) {
			var real = scope.LineItem;
			var lineItem = Object.create(real);
			lineItem.Specs = scope.design.orderSpecs;
			scope.LineItem = lineItem;
			scope.mtvSpecForm = 'addToOrderSpecForm.hcf?id=' + encodeURIComponent(real.Product.InteropID) + '&r=' + Math.random();
		}
	};
}]);
