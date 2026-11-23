basePath = '../';

files = [
	JASMINE,
	JASMINE_ADAPTER,
	'bswh-punchout/lib/angular/angular.1.1.5.js',
	'bswh-punchout/lib/angular/angular-*.min.js',
	'test/lib/angular/angular-mocks.js',
    'bswh-punchout/lib/angular/ui-validate.js',
    'bswh-punchout/lib/angular/ui-mask.js',
    'bswh-punchout/lib/jquery-2.0.0.js',
	'bswh-punchout/js/app.js',
	'bswh-punchout/js/**/*.js',

	'config/Four51APIAppName.js',
	'test/unit/appSpec.js',
    'test/unit/filtersSpec.js',
    'test/unit/451Spec.js',
    'test/unit/directivesSpec.js',
    'test/unit/routingSpec.js',
    'test/unit/categorySpec.js',
    'test/unit/addressSpec.js',
    'test/unit/messagesSpec.js',
    'test/unit/productSpec.js'

];

autoWatch = true;

browsers = ['Chrome'];

junitReporter = {
	outputFile: 'test_out/unit.xml',
	suite: 'unit'
};
