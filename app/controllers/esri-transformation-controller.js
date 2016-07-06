'use strict';

var Promise = require( 'lie' );
var communicator = require( '../lib/esri-communicator' );
var transformer = require( 'enketo-transformer' );
var account = require( '../models/account-model' );
var utils = require( '../lib/utils' );
var isArray = require( 'lodash/isArray' );
var express = require( 'express' );
var url = require( 'url' );
var router = express.Router();
var config = require( '../models/config-model' ).server;

//var debug = require( 'debug' )( 'transformation-controller' );

module.exports = function( app ) {
    app.use( app.get( 'base path' ) + '/transform', router );
};

router
    .post( '*', function( req, res, next ) {
        // set content-type to json to provide appropriate json Error responses
        res.set( 'Content-Type', 'application/json' );
        next();
    } )
    .post( '/xform', getEsriSurveyParts )
    .post( '/xform/hash', getEsriSurveyHash );

/**
 * Obtains HTML Form, XML model, and existing XML instance
 * @param  {[type]}   req  [description]
 * @param  {[type]}   res  [description]
 * @param  {Function} next [description]
 * @return {[type]}        [description]
 */
function getEsriSurveyParts( req, res, next ) {
    var surveyBare;

    _getSurveyParams( req )
        .then( function( survey ) {
            if ( survey.esriId ) {
                return _getTransformationResultsDirectly( survey )
                    .pipe( res );
            } else if ( survey.info ) {
                _getFormDirectly( survey )
                    .then( function( survey ) {
                        _respond( res, survey );
                    } )
                    .catch( next );
            }
        } )
        .catch( next );
}

/**
 * Obtains the hash of the cached Survey Parts
 * @param  {[type]}   req  [description]
 * @param  {[type]}   res  [description]
 * @param  {Function} next [description]
 * @return {[type]}        [description]
 */
function getEsriSurveyHash( req, res, next ) {
    _getSurveyParams( req )
        .then( function( survey ) {
            return '';
            //return cacheModel.getHashes( survey );
        } )
        //.then( _updateCache )
        .then( function( survey ) {
            if ( survey.hasOwnProperty( 'credentials' ) ) {
                delete survey.credentials;
            }
            res.status( 200 );
            res.send( {
                hash: _getCombinedHash( survey )
            } );
        } )
        .catch( next );
}

function _getFormDirectly( survey ) {
    return communicator.getXForm( survey )
        .then( _addMediaMap )
        .then( transformer.transform );
}

function _getTransformationResultsDirectly( survey ) {
    return communicator.getTransformationResults( survey );
}

function _authenticate( survey ) {
    return communicator.authenticate( survey );
}

function _addMediaHashes( survey ) {
    survey.mediaHash = utils.getXformsManifestHash( survey.manifest, 'all' );
    return Promise.resolve( survey );
}

/**
 * Adds a media map, see enketo/enketo-transformer
 * 
 * @param {[type]} survey [description]
 */
function _addMediaMap( survey ) {
    var mediaMap = null;

    return new Promise( function( resolve ) {
        if ( isArray( survey.manifest ) ) {
            survey.manifest.forEach( function( file ) {
                mediaMap = mediaMap ? mediaMap : {};
                if ( file.downloadUrl ) {
                    mediaMap[ file.filename ] = _toLocalMediaUrl( file.downloadUrl );
                }
            } );
        }
        survey.media = mediaMap;
        resolve( survey );
    } );
}

/**
 * Converts a url to a local (proxied) url.
 *
 * @param  {string} url The url to convert.
 * @return {string}     The converted url.
 */
function _toLocalMediaUrl( url ) {
    var localUrl = config[ 'base path' ] + '/media/get/' + url.replace( /(https?):\/\//, '$1/' );
    return localUrl;
}

function _respond( res, survey ) {
    delete survey.credentials;

    res.status( 200 );
    res.send( {
        form: survey.form,
        // previously this was JSON.stringified, not sure why
        model: survey.model,
        theme: survey.theme,
        branding: survey.account.branding,
        // The hash components are converted to deal with a node_redis limitation with storing and retrieving null.
        // If a form contains no media this hash is null, which would be an empty string upon first load.
        // Subsequent cache checks will however get the string value 'null' causing the form cache to be unnecessarily refreshed
        // on the client.
        hash: _getCombinedHash( survey )
    } );
}

function _getCombinedHash( survey ) {
    var brandingHash = ( survey.account.branding && survey.account.branding.source ) ? utils.md5( survey.account.branding.source ) : '';
    return [ String( survey.formHash ), String( survey.mediaHash ), String( survey.xslHash ), String( survey.theme ), String( brandingHash ) ].join( '-' );
}

function _setCookieAndCredentials( survey, req ) {
    // for external authentication, pass the cookie(s)
    survey.cookie = req.headers.cookie;
    // for OpenRosa authentication, add the credentials
    //survey.credentials = user.getCredentials( req );
    return Promise.resolve( survey );
}

function _getSurveyParams( req ) {
    var error;
    var urlObj;
    var domain;
    var params = req.body;
    var noHashes = ( params.noHashes === 'true' );

    if ( params.enketoId ) {
        return Promise.resolve( {
            esriId: params.enketoId
        } );
    }
    /*else if ( params.enketoId ) {
           return surveyModel.get( params.enketoId )
               .then( account.check )
               .then( _checkQuota )
               .then( function( survey ) {
                   survey.noHashes = noHashes;
                   return _setCookieAndCredentials( survey, req );
               } );
       } */
    else if ( params.xformUrl ) {
        urlObj = url.parse( params.xformUrl );
        if ( !urlObj || !urlObj.protocol || !urlObj.host ) {
            error = new Error( 'Bad Request. Form URL is invalid.' );
            error.status = 400;
            throw error;
        }
        // The previews using the xform parameter are less strictly checked.
        // If an account with the domain is active, the check will pass.
        domain = urlObj.protocol + '//' + urlObj.host;
        return account.check( {
                openRosaServer: domain
            } )
            .then( function( survey ) {
                // no need to check quota
                return Promise.resolve( {
                    info: {
                        downloadUrl: params.xformUrl
                    },
                    account: survey.account
                } );
            } )
            .then( function( survey ) {
                survey.noHashes = noHashes;
                return _setCookieAndCredentials( survey, req );
            } );
    } else {
        error = new Error( 'Bad Request. Survey information not complete.' );
        error.status = 400;
        throw error;
    }
}
