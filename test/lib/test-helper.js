/* jshint node: true */
'use strict';

var exports = module.exports = {};

exports.check = function(done, cb) {
  return function(err) { try { cb(err); done(); } catch (e) { done(e); } };
};

exports.checkN = function(n, done, cb) {
  return function(err) { if (--n === 0) { exports.check(done, cb)(err); } };
};
