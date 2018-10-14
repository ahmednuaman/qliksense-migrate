#!/usr/bin/env node

const async = require('async')
const colors = require('colors')
const request = require('request')

const HOST = process.env.HOST
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

const extensionRequest = request.defaults({
  headers,
  qs,
  baseUrl: `${HOST}extension/`
})

const wesAPIRequest = request.defaults({
  headers,
  qs,
  baseUrl: `${HOST}api/wes/v1/extensions/export/`
})

const prepareExtensionsMigration = new Promise((resolve, reject) => {
  extensionRequest.get('schema', (error, response, body) => {
    if (error) {
      return reject(error)
    }

    body
      .filter(({ type }) => type === 'extension')
      .forEach((extension) => {
        requests.push((done) => {
          wesAPIRequest
            .get(extension.key)
            .pipe(
              extension
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
