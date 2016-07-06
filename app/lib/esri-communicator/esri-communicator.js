'use strict';

var request = require( 'request' );
//var Auth = require( 'request/lib/auth' ).Auth;
var TError = require( '../custom-error' ).TranslatedError;
var Promise = require( 'lie' );
var config = require( '../../models/config-model' ).server;
var debug = require( 'debug' )( 'openrosa-communicator' );
var parser = new require( 'xml2js' ).Parser();


/**
 * Gets XForm from url
 *
 * @param  {*}    survey  survey object
 * @return {[type]}         promise
 */
function getXForm( survey ) {

    return _request( {
        url: survey.info.downloadUrl,
        auth: survey.credentials,
        headers: {
            cookie: survey.cookie
        }
    } ).then( function( xform ) {
        survey.xform = xform;
        return Promise.resolve( survey );
    } );
}

function getTransformationResults( survey ) {
    return request( {
        url: getEsriTransformationUrl( survey.esriId ),
        headers: {
            cookie: survey.cookie
        }
    } );
}

/**
 * Checks the maximum acceptable submission size the server accepts
 * @param  {[type]} survey survey object
 * @return {[type]}        promise
 */
function getMaxSize( survey ) {
    /*
    var server;
    var submissionUrl;
    var options;

    server = survey.openRosaServer;
    submissionUrl = ( server.lastIndexOf( '/' ) === server.length - 1 ) ? server + 'submission' : server + '/submission';

    options = {
        url: submissionUrl,
        auth: survey.credentials,
        headers: {
            cookie: survey.cookie
        },
        method: 'head'
    };

    return _request( options )
        .then( function( response ) {
            return response.headers[ 'x-openrosa-accept-content-length' ];
        } );
    */
}

function authenticate( survey ) {
    /*
    var options = {
        url: getFormListUrl( survey.openRosaServer, survey.openRosaId ),
        auth: survey.credentials,
        // Formhub has a bug and cannot use the correct HEAD method.
        method: config[ 'linked form and data server' ][ 'legacy formhub' ] ? 'get' : 'head'
    };

    return _request( options )
        .then( function() {
            debug( 'successful (authenticated if it was necessary)' );
            return survey;
        } );
    */
}

/**
 * Generates an Auhorization header that can be used to inject into piped requests (e.g. submissions).
 * 
 * @param  {string} url         [description]
 * @param  {?{user: string, pass: string}=} credentials [description]
 * @return {string}             [description]
 */
function getAuthHeader( url, credentials ) {
    /*
    var auth;
    var authHeader;
    var options = {
        url: url,
        method: 'head',
        headers: {
            'X-OpenRosa-Version': '1.0'
        }
    };

    return new Promise( function( resolve ) {
        var req = request( options, function( error, response ) {
            if ( response.statusCode === 401 && credentials && credentials.user && credentials.pass ) {
                // Using request's internal library we create an appropiate authorization header.
                // This is a bit dangerous because internal changes in request/request, could break this code.
                req.method = 'POST';
                auth = new Auth( req );
                auth.hasAuth = true;
                auth.user = credentials.user;
                auth.pass = credentials.pass;
                authHeader = auth.onResponse( response );
                resolve( authHeader );
            } else {
                resolve( null );
            }
        } );
    } );
    */
}

function getEsriTransformationUrl( esriId ) {
    return 'http://www.arcgis.com/sharing/rest/content/items/' + esriId + '/info/webform.json';
}

function getUpdatedRequestOptions( options ) {
    options.method = options.method || 'get';

    // set headers
    options.headers = options.headers || {};
    options.headers[ 'X-OpenRosa-Version' ] = '1.0';

    if ( !options.headers.cookie ) {
        // remove undefined cookie
        delete options.headers.cookie;
    }

    // set Authorization header
    if ( !options.auth ) {
        delete options.auth;
    } else {
        // check first is DIGEST or BASIC is required
        options.auth.sendImmediately = false;
    }

    return options;
}

/**
 * Sends a request to an OpenRosa server
 *
 * @param  { * } url  request options object
 * @return {?string=}    promise
 */
function _request( options ) {
    var error;
    var method;

    return new Promise( function( resolve, reject ) {
        if ( typeof options !== 'object' && !options.url ) {
            error = new Error( 'Bad request. No options provided.' );
            error.status = 400;
            reject( error );
        }

        options = getUpdatedRequestOptions( options );

        // due to a bug in request/request using options.method with Digest Auth we won't pass method as an option
        method = options.method;
        delete options.method;

        debug( 'sending ' + method + ' request to url: ' + options.url );

        request[ method ]( options, function( error, response, body ) {
            if ( error ) {
                debug( 'Error occurred when requesting ' + options.url, error );
                reject( error );
            } else if ( response.statusCode === 401 ) {
                error = new Error( 'Forbidden. Authorization Required.' );
                error.status = response.statusCode;
                reject( error );
            } else if ( response.statusCode < 200 || response.statusCode >= 300 ) {
                error = new Error( 'Request to ' + options.url + ' failed.' );
                error.status = response.statusCode;
                reject( error );
            } else if ( method === 'head' ) {
                resolve( response );
            } else {
                debug( 'response of request to ' + options.url + ' has status code: ', response.statusCode );
                resolve( body );
            }
        } );
    } );
}

module.exports = {
    getXForm: getXForm,
    getTransformationResults: getTransformationResults,
    getMaxSize: getMaxSize,
    authenticate: authenticate,
    getAuthHeader: getAuthHeader,
    getUpdatedRequestOptions: getUpdatedRequestOptions
};
