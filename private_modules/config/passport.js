var _ = require('underscore');
var passport = require('passport');
var GitHubStrategy = require('passport-github').Strategy;
var requirePrivate = require('require-private');

var User = requirePrivate('models/User');
var Repo = requirePrivate('models/Repo');
var secrets = requirePrivate('config/secrets');

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

/**
 * OAuth Strategy Overview
 *
 * - User is already logged in.
 *   - Check if there is an existing account with a provider id or email.
 *     - If there is, return an error message. (Account merging not supported)
 *     - Else link new OAuth account with currently logged-in user.
 * - User is not logged in.
 *   - Check if it's a returning user.
 *     - If returning user, sign in and we are done.
 *     - Else check if there is an existing account with user's email.
 *       - If there is, return an error message.
 *       - Else create a new account.
 */

/**
 * Sign in with GitHub.
 */

passport.use(new GitHubStrategy(secrets.github, function(req, accessToken, refreshToken, profile, done) {
  if (req.user) {
    User.findOne({
      $or: [{
        github: profile.id
      }, {
        email: profile.email
      }]
    }, function(err, existingUser) {
      if (existingUser) {
        req.flash('errors', {
          msg: 'There is already a GitHub account that belongs to you. Sign in with that account or delete it, then link it with your current account.'
        });
        done(err);
      } else {
        User.findById(req.user.id, function(err, user) {
          user.github = profile.id;
          user.tokens.push({
            kind: 'github',
            accessToken: accessToken
          });
          user.profile.name = user.profile.name || profile.displayName;
          user.profile.picture = user.profile.picture || profile._json.avatar_url;
          user.profile.location = user.profile.location || profile._json.location;
          user.profile.website = user.profile.website || profile._json.blog;
          user.save(function(err) {
            req.flash('info', {
              msg: 'GitHub account has been linked.'
            });
            done(err, user);
          });
        });
      }
    });
  } else {
    User.findOne({
      github: profile.id
    }, function(err, existingUser) {
      if (existingUser) return done(null, existingUser);
      var user = new User();
      user.email = profile._json.email;
      user.github = profile.id;
      user.tokens.push({
        kind: 'github',
        accessToken: accessToken
      });
      user.profile.name = profile.displayName;
      user.profile.picture = profile._json.avatar_url;
      user.profile.location = profile._json.location;
      user.profile.website = profile._json.blog;
      user.save(function(err) {
        console.log('error',err)
        var repo = new Repo();
        repo.id = profile.id;
        repo.repos = {};
        repo.repos.local = [];
        repo.repos.remote = [];
        repo.save(function(err) {
          done(err, user);
        });
      });

    });
  }
}));


/**
 * Login Required middleware.
 */

exports.isAuthenticated = function(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.json(false);
};

/**
 * Authorization Required middleware.
 */

exports.isAuthorized = function(req, res, next) {
  var provider = req.path.split('/').slice(-1)[0];
  if (_.findWhere(req.user.tokens, {
    kind: provider
  })) next();
  else res.redirect('/auth/' + provider);
};
