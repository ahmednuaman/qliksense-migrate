#!/usr/bin/env node

const async = require('async')
const colors = require('colors')
const request = require('request')

const OLD_HOST = process.env.OLD_HOST
const NEW_HOST = process.env.NEW_HOST
const XRF_KEY = require('randomstring').generate({
  length: 16,
  charset: 'alphanumeric'
})

let requests = []

const headers = {
  'X-Qlik-Xrfkey': XRF_KEY,
  userid: process.env.USERID
}
const qs = {
  xrfkey: XRF_KEY
}

const oldHostExtensionRequest = request.defaults({
  headers,
  qs,
  baseUrl: `${OLD_HOST}extension/`
})

const oldHostWesAPIRequest = request.defaults({
  headers,
  qs,
  baseUrl: `${OLD_HOST}api/wes/v1/extensions/export/`
})

const newHostExtensionRequest = request.defaults({
  headers,
  qs,
  baseUrl: `${NEW_HOST}extension/`
})

const prepareExtensionsMigration = new Promise((resolve, reject) => {
  oldHostExtensionRequest.get('schema', (error, response, body) => {
    if (error) {
      return reject(error)
    }

    body
      .filter(({ type }) => type === 'extension')
      .forEach((extension) => {
        requests.push((done) => {
          oldHostWesAPIRequest
            .get(extension.key)
            .pipe(
              newHostExtensionRequest
                .post('upload', {
                  headers: Object.assign(headers, {
                    'content-type': 'application/x-www-form-urlencoded'
                  })
                })
                .on('error', (error) => done(error.toString()))
                .on('data', (data) => console.log(extension.key, data.toString()))
                .on('response', (response) => {
                  console.log(`Successfully deployed extension ${extension.key}`, response.statusCode)
                  done()
                })
            )
        })
      })

    resolve(body)
  })
})

Promise.all([
  prepareExtensionsMigration()
])
  .then(() => {
    async.series(requests, (error) => {
      if (error) {
        console.log(colors.red(error))
      } else {
        console.log(colors.bold.green('All files successfully deployed'))
      }
    })
  }, console.log.bind(console))
