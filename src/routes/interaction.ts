import express, { NextFunction, Request, Response, urlencoded } from 'express';
import Provider from 'oidc-provider';
import { authorize, generateOtp, login, abortLogin } from '../controllers/auth-controller';
import { LoginTimeoutError, parseForwardedHeader, setNoCache, getClientHomeUrl } from '../utils/helpers';
import { errors } from 'oidc-provider';
import logger from '../modules/winston.config';
import { UAParser } from 'ua-parser-js';

const body = urlencoded({ extended: false });

export const oidcRouter = async (oidcProvider: Provider) => {
  const oidcRouter = express.Router();
  oidcRouter.get('/:uid', setNoCache, await authorize(oidcProvider));
  oidcRouter.post('/:uid/otp', setNoCache, body, await generateOtp(oidcProvider));
  oidcRouter.post('/:uid/login', setNoCache, body, await login(oidcProvider));
  oidcRouter.post('/:uid/abort', await abortLogin(oidcProvider));
  oidcRouter.use(async (err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err) {
      try {
        const ua = UAParser(req.headers['user-agent']);
        const forwardedHeaders = parseForwardedHeader(req.headers.forwarded);
        logger.error(
          'OIDC interaction error:',
          Object.assign(err, { ipAddr: forwardedHeaders.for, userAgent: ua, path: req.path }),
        );
      } catch {
        logger.error('OIDC interaction error:', err);
      }
      let errorStatus = 500;
      if (err instanceof LoginTimeoutError) {
        errorStatus = err.status || 408;
      } else if (err instanceof errors.InvalidRequest) {
        errorStatus = err.status || 400;
      } else if (err instanceof errors.InvalidGrant) {
        errorStatus = err.status || 400;
      } else if (err instanceof errors.InvalidClient) {
        errorStatus = err.status || 401;
      } else if (err instanceof errors.InvalidRedirectUri) {
        errorStatus = err.status || 400;
      } else if (err instanceof errors.InvalidScope) {
        errorStatus = err.status || 400;
      } else if (err instanceof errors.AccessDenied) {
        errorStatus = err.status || 403;
      } else if (err instanceof errors.InteractionRequired) {
        errorStatus = err.status || 400;
      } else if (err instanceof errors.ConsentRequired) {
        errorStatus = err.status || 400;
      } else if (err instanceof errors.LoginRequired) {
        errorStatus = err.status || 401;
      } else if (err instanceof errors.InvalidToken) {
        errorStatus = err.status || 401;
      } else if (err instanceof errors.SessionNotFound) {
        errorStatus = err.status || 400;
      }

      let clientHomeUrl = '';
      const uid = req.params?.uid || req.path.split('/').find(Boolean);
      if (uid && typeof uid === 'string') {
        clientHomeUrl = await getClientHomeUrl(uid);
      }

      return res.status(errorStatus).render('error', {
        title: "We couldn't sign you in",
        message:
          'There was a problem completing your sign-in request. Please return to the application and try signing in again.',
        clientHomeUrl,
      });
    }
  });

  return oidcRouter;
};
