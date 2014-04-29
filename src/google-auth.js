var gapi = require('googleapis');
var jwt = require('jwt-simple');
var OAuth2 = gapi.auth.OAuth2;

// Relevant README/docs at https://github.com/google/google-api-nodejs-client/

function makeAuth(config) {
  var oauth2Client =
      new OAuth2(
          config.google.clientId,
          config.google.clientSecret,
          config.baseUrl + config.google.redirect
        );

  return {
    getAuthUrl: function() {
        return oauth2Client.generateAuthUrl({
        access_type: 'online',
        approval_prompt: 'auto',
        // NOTE(joe): We do not use the drive scope on the server, but we ask
        // for it so that the user won't get another popup when we do the
        // authorization on the client.
        // #notpola
        scope: 'email https://www.googleapis.com/auth/drive.file'
      });
    },
    serveRedirect: function(req, callback) {
      var authCode = req.param("code");
      console.log(JSON.stringify(req.param("code")));
      var oauth2Client =
          new OAuth2(
              config.google.clientId,
              config.google.clientSecret,
              config.baseUrl + config.google.redirect
            );
      oauth2Client.getToken(authCode, function(err, tokens) {
        if(err !== null) { callback(err, null); return; }
        // NOTE(joe): These few lines make security assumptions and you should
        // edit with care.  I wrote this when Google was deprecating one OAuth
        // library in favor of another (deprecation to occur in Sept 2014), so
        // I'm pasting a few links that will hopefully be enlightening down the
        // road.
        //
        // See https://developers.google.com/accounts/docs/OAuth2Login#obtainuserinfo
        // for an explanation of what we are getting from the id_token
        //
        // Also see
        //
        // https://developers.google.com/+/api/auth-migration#email
        //
        // as this appears to be the only way to get a user's email address and
        // a unique identifier for them without trying to gain access to
        // their entire G+ profile (which includes things that we have no
        // reason to know, like where they live and what their gender is).
        //
        // Note also that id_token should not escape from this function: if
        // other contexts start using id_token-like data, something is wrong
        // because they can't guarantee that the tokens came over an https
        // connection to Google (which getToken above does).

        // The {}, true below indicate that we are completely trusting our HTTPS
        // connection to Google for the validity of the information in id_token
        // (justified by the first link above).  If we end up getting id_tokens
        // from elsewhere, we need to set up polling of Google's public key
        // servers to get the correct public key of the day to validate these
        // tokens cryptographically.
        var decodedId = jwt.decode(tokens.id_token, {}, true);
        callback(null, { googleId: decodedId["sub"], email: decodedId["email"], access: tokens.access_token });
      });
    }
  };
}

module.exports = {
  makeAuth: makeAuth
};