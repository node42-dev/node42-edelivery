/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

export class N42Environment {
  constructor(env = null, ctx = null) {
    this._env = env;
    this._ctx = ctx;
    this.platform = this.#detectPlatform();
    this.isServerless = !!this.platform;
    this._cache = new Map();
    this.canSet = false;
  }

  #detectPlatform() {
    if (globalThis?.caches?.default || typeof WebSocketPair !== 'undefined') {
      return 'cloudflare-workers';
    }
    if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT) {
      return 'aws-lambda';
    }
    if (process.env.AZURE_FUNCTIONS_ENVIRONMENT || process.env.WEBSITE_SITE_NAME) {
      return 'azure-functions';
    }
    if (process.env.FUNCTION_NAME || process.env.GCP_PROJECT) {
      return 'google-cloud-functions';
    }
    if (process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_REGION) {
      return 'vercel';
    }
    if (process.env.NETLIFY || process.env.CONTEXT === 'deploy-preview') {
      return 'netlify';
    }
    if (typeof Deno !== 'undefined') {
      return 'deno';
    }
    return null;
  }

  get(key, defaultValue = undefined) {
    const cached = this._cache.get(key);
    if (cached !== undefined) return cached;

    let value;

    switch (this.platform) {
      case 'cloudflare-workers': {
        value = this._env?.[key];
        break;
      }
      case 'aws-lambda':
      case 'azure-functions':
      case 'google-cloud-functions':
      case 'vercel':
      case 'netlify':
      default: {
        value = process.env[key];
        break;
      }
    }

    this._cache.set(key, value);
    return value ?? defaultValue;
  }

  set(key, value) {
    if (this.platform === 'cloudflare-workers') {
      throw new Error('Cannot set env vars at runtime in Cloudflare Workers');
    }
    if (!this.isServerless) {
      process.env[key] = value;
      this._cache.set(key, value);
      return;
    }
    throw new Error(`Setting env vars at runtime not supported on ${this.platform}`);
  }

  toObject() {
    switch (this.platform) {
      case 'cloudflare-workers':
        return this._env ? { ...this._env } : {};
      default:
        return { ...process.env };
    }
  }

  get isCloudflare() {
    return this.platform === 'cloudflare-workers';
  }

  get isAws() {
    return this.platform === 'aws-lambda';
  }

  scheduleTask(promise) {
    switch (this.platform) {
      case 'cloudflare-workers': {
        // ctx.waitUntil keeps worker alive after response
        if (this._ctx?.waitUntil) {
          this._ctx.waitUntil(promise);
        } else {
          console.warn('scheduleTask: no ctx available on Cloudflare');
        }
        break;
      }

      case 'aws-lambda': {
        // Fire and forget — Lambda will freeze after response anyway
        // Caller should use async Lambda invocation instead
        promise.catch(e => console.error('scheduleTask failed:', e.message));
        break;
      }

      case 'azure-functions': {
        // Same as Lambda — fire and forget
        promise.catch(e => console.error('scheduleTask failed:', e.message));
        break;
      }

      default: {
        // Local — just run it
        promise.catch(e => console.error('scheduleTask failed:', e.message));
        break;
      }
    }
  }
}