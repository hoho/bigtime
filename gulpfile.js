'use strict';

var gulp = require('gulp');

var eslint = require('gulp-eslint');
var filter = require('gulp-filter');
var rename = require('gulp-rename');
var uglify = require('gulp-uglify');
var prefix = require('gulp-autoprefixer');
var minifyCSS = require('gulp-minify-css');

var path = require('path');


var DEST = 'build';


gulp.task('eslint', function() {
    return gulp.src(['gulpfile.js', 'bigtime.js'])
        .pipe(eslint({
            rules: {
                'quotes': [2, 'single'],
                'no-shadow-restricted-names': 0,
                'no-underscore-dangle': 0,
                'no-multi-spaces': 0,
                'key-spacing': 0
            },
            env: {
                'node': true,
                'browser': true
            }
        }))
        .pipe(eslint.format());
});


gulp.task('build', function() {
    var cssFilter = filter(['**/*.css']);
    return gulp.src(['bigtime.js', 'bigtime.css'])
        .pipe(cssFilter)
        .pipe(prefix('last 1 version', '> 1%'))
        .pipe(cssFilter.restore())
        .pipe(gulp.dest(DEST));
});


gulp.task('uglify', ['build'], function() {
    var cssFilter = filter(['**/*.css']);
    var jsFilter = filter(['**/*.js']);

    return gulp.src([path.join(DEST, 'bigtime.js'), path.join(DEST, 'bigtime.css')])

        .pipe(cssFilter)
        .pipe(minifyCSS())
        .pipe(rename('bigtime.min.css'))
        .pipe(cssFilter.restore())

        .pipe(jsFilter)
        .pipe(uglify({preserveComments: 'some'}))
        .pipe(rename('bigtime.min.js'))
        .pipe(jsFilter.restore())

        .pipe(gulp.dest(DEST));
});


gulp.task('assert-version', function(err) {
    var assertVersion = require('assert-version');

    err(assertVersion({
        'bigtime.js': '',
        'bigtime.css': '',
        'package.json': '',
        'bower.json': ''
    }));
});


gulp.task('default', ['eslint', 'assert-version', 'build', 'uglify']);
