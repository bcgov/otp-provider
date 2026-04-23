const jose = require('node-jose');

async function createKeystore() {
  const keystore = jose.JWK.createKeyStore();

  // Generate a new RSA key
  await keystore.generate('RSA', 2048, { alg: 'RS256', use: 'sig' });

  // Export the public key set (pass 'false' to exclude private keys)
  const jwks = keystore.toJSON(true);
  console.log(JSON.stringify(jwks, null, 2).replace(/[\r\n]+/g, ' '));
}

createKeystore();
