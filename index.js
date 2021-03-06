#!/usr/bin/env node

const { generate } = require('randomstring')
const _ = require('lodash')
const async = require('async')
const colors = require('colors')
const request = require('request')

const OLD_HOST = process.env.OLD_HOST
const OLD_USERID = process.env.OLD_USERID
const NEW_HOST = process.env.NEW_HOST
const NEW_USERID = process.env.NEW_USERID

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'

const makeXRFKey = () => generate({
  length: 16,
  charset: 'alphanumeric'
})

const makeHeadersAndQS = (userid) => {
  const xrfkey = makeXRFKey()

  return {
    headers: {
      userid,
      'X-Qlik-Xrfkey': xrfkey
    },
    qs: {
      xrfkey
    }
  }
}

const prepareExtensionsMigration = () => new Promise((resolve, reject) => {
  const {
    headers,
    qs
  } = makeHeadersAndQS(OLD_USERID)

  request.get({
    headers,
    qs,
    json: true,
    url: `${OLD_HOST}qrs/extension/schema`
  }, (error, response, body) => {
    if (error) {
      return reject(error)
    }

    const requests =
      _
        .map(body, (entry, key) => Object.assign(entry, { key }))
        .filter(({ type }) => type === 'visualization')
        .map((extension) => (done) => {
          const {
            headers,
            qs
          } = makeHeadersAndQS(NEW_USERID)

          request.delete({
            headers,
            qs,
            url: `${NEW_HOST}qrs/extension/name/${extension.key}`
          }, (error, response, body) => {
            if (error) {
              return reject(error)
            }

            const {
              headers,
              qs
            } = makeHeadersAndQS(OLD_USERID)

            const {
              headers: newHeaders,
              qs: newQS
            } = makeHeadersAndQS(NEW_USERID)

            request
              .get({
                headers,
                qs,
                url: `${OLD_HOST}api/wes/v1/extensions/export/${extension.key}`
              })
              .pipe(
                request.post(`${NEW_HOST}qrs/extension/upload`, {
                  headers: Object.assign(newHeaders, {
                    'content-type': 'application/x-www-form-urlencoded'
                  }),
                  qs: newQS
                })
                  .on('error', (error) => done(error.toString()))
                  .on('data', (data) => console.log(extension.key, data.toString()))
                  .on('response', (response) => {
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                      console.log(`Successfully deployed extension ${extension.key}`, response.statusCode)
                      done()
                    } else {
                      done(response)
                    }
                  })
              )
          })
        })

    resolve(requests)
  })
})

Promise.all([
  prepareExtensionsMigration()
])
  .then(([ extensionRequests ]) => {
    async.series(extensionRequests, (error) => {
      if (error) {
        console.log(colors.red(error))
        process.exit(1)
      } else {
        console.log(colors.bold.green('All files successfully deployed'))
      }
    })
  }, console.log.bind(console))
