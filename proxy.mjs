import request from 'request'

// https://qiita.com/norami_dream/items/ab8e4762effffd3cf7d4
function proxy(req, res, next, url) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0' // Avoids DEPTH_ZERO_SELF_SIGNED_CERT error for self-signed certs
  const { method } = req
  const proxyRequestHeaders = Object.assign({}, req.headers)
  // for(key of ['host', 'authorization', 'cookie']){
  //   delete proxyRequestHeaders.headers[key]
  // }
  console.log('headers', proxyRequestHeaders)
  console.log('url', url)
  console.log('req.rawBody', req.rawBody)
  request(
    {
      url,
      qs: req.query,
      body: req.rawBody, // POSTのプロキシがうまくいかない・・・！
      from: req.rawBody,
      method,
      headers: proxyRequestHeaders.headers,
    },
    function (error, response, body) {
      if (error || req.rawBody) {
        console.error('error:', error) // Print the error if one occurred
        console.log('statusCode:', response && response.statusCode) // Print the response status code if a response was received
        // console.log('body:', body); // Print the HTML for the Google homepage.
      }
    }
  ).pipe(res)
  if (req.rawBody) {
    // console.log(res)
    // res.set('Content-Type', 'application/json')
    // res.type('application/json')
  }
}

export { proxy }
