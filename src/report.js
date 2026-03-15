import fs   from 'fs';
import path from 'path';

import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';
import { getCertCommonName } from '../src/security/pki.js';
import { validateDocument } from './document/validator.js';

import { 
  createDb, 
  getDbAdapter 
} from './db/db.js';

import { 
  getUserReportsDir,
  getUserCertsDir
} from '../src/cli/paths.js';

import { 
  N42Error, 
  N42ErrorCode 
} from './core/error.js';

import { 
  PEPPOL_ORG_ID_TYPES,
  PEPPOL_REV_ORG_ID_TYPES
} from '../src/core/constants.js';


let db = null;
async function getDb() {
  if (!db) db = createDb(await getDbAdapter());
  return db;
}

function el(doc, tag, text, attrs = {}) {
  const node = doc.createElement(tag);
  if (text !== null && text !== undefined) node.appendChild(doc.createTextNode(String(text)));
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  return node;
}

function resolveOrgId(orgId, orgIdType) {
  const schemeId = PEPPOL_REV_ORG_ID_TYPES[orgIdType]
    ? orgIdType
    : PEPPOL_ORG_ID_TYPES[orgIdType] ?? null;
  return { schemeId, resolvedOrgId: orgId };
}

export function buildOrgId(doc, idName, orgId, orgIdType) {
  const { schemeId, resolvedOrgId } = resolveOrgId(orgId, orgIdType);
  return el(doc, idName, resolvedOrgId, schemeId ? { schemeID: schemeId } : {});
}

export function aggregateStats(transactions, fromDate, toDate) {
  const from = new Date(fromDate).getTime();
  const to   = new Date(toDate).getTime();

  const filtered = transactions.filter(t => {
    const createdAt = new Date(t.createdAt).getTime();
    return createdAt >= from && createdAt <= to;
  });

  const senders                                           = new Set();
  const sendersByCountry                                  = {};
  const sendersByDocumentTypeCountry                      = {};
  const sendersByDocumentTypeProcessId                    = {};
  const sendersByDocumentTypeProcessIdCountry             = {};
  const outgoingByTransportProfile                        = {};
  const outgoingByReceiverCommonNameDocumentTypeProcessId = {};

  for (const t of filtered) {
    senders.add(t.senderId);

    // by country
    sendersByCountry[t.senderCountry] ??= new Set();
    sendersByCountry[t.senderCountry].add(t.senderId);

    // by document type + country
    const dtCc = `${t.docTypeId}|${t.senderCountry}`;
    sendersByDocumentTypeCountry[dtCc] ??= new Set();
    sendersByDocumentTypeCountry[dtCc].add(t.senderId);

    // by document type + process type
    const dtPr = `${t.docTypeId}|${t.processId}`;
    sendersByDocumentTypeProcessId[dtPr] ??= new Set();
    sendersByDocumentTypeProcessId[dtPr].add(t.senderId);

    // by document type + process type + country
    const dtPrCc = `${t.docTypeId}|${t.processId}|${t.senderCountry}`;
    sendersByDocumentTypeProcessIdCountry[dtPrCc] ??= new Set();
    sendersByDocumentTypeProcessIdCountry[dtPrCc].add(t.senderId);

    // outgoing by transport profile
    outgoingByTransportProfile[t.transportProfile] ??= 0;
    outgoingByTransportProfile[t.transportProfile]++;

    // outgoing by receiver CN + document type + process type
    const spDtPr = `${t.receiverCN}|${t.docTypeId}|${t.processId}`;
    outgoingByReceiverCommonNameDocumentTypeProcessId[spDtPr] ??= 0;
    outgoingByReceiverCommonNameDocumentTypeProcessId[spDtPr]++;
  }

  return {
    fromDate,
    toDate,
    outgoing: filtered.length,
    senders,
    sendersByCountry,
    sendersByDocumentTypeCountry,
    sendersByDocumentTypeProcessId,
    sendersByDocumentTypeProcessIdCountry,
    outgoingByTransportProfile,
    outgoingByReceiverCommonNameDocumentTypeProcessId
  };
}

export function buildReportHeader(doc, fromDate, toDate, senderCN) {
  const header = doc.createElement('Header');

  const period = doc.createElement('ReportPeriod');
  period.appendChild(el(doc, 'StartDate', fromDate instanceof Date ? fromDate.toISOString().slice(0, 10) : fromDate));
  period.appendChild(el(doc, 'EndDate',   toDate   instanceof Date ? toDate.toISOString().slice(0, 10)   : toDate));
  header.appendChild(period);

  header.appendChild(el(doc, 'ReporterID', senderCN, { schemeID: 'CertSubjectCN' }));
  return header;
}

function buildEndUserCounts(doc, senders = new Set(), receivers = new Set()) {
  const union = new Set([...senders, ...receivers]);
  return [
    el(doc, 'SendingEndUsers', senders.size),
    el(doc, 'ReceivingEndUsers', receivers.size),
    el(doc, 'SendingOrReceivingEndUsers', union.size)
  ];
}

export function buildEndUserReport(stats, senderCN) {
  const dom  = new DOMImplementation();

  const doc  = dom.createDocument('urn:fdc:peppol:end-user-statistics-report:1.1', null, null);
  const root = doc.createElementNS('urn:fdc:peppol:end-user-statistics-report:1.1', 'EndUserStatisticsReport');

  root.appendChild(el(doc, 'CustomizationID', 'urn:fdc:peppol.eu:edec:trns:end-user-statistics-report:1.1'));
  root.appendChild(el(doc, 'ProfileID',       'urn:fdc:peppol.eu:edec:bis:reporting:1.0'));
  root.appendChild(buildReportHeader(doc, stats.fromDate, stats.toDate, senderCN));

  const fullSet = doc.createElement('FullSet');
  for (const n of buildEndUserCounts(doc, stats.senders)) fullSet.appendChild(n);
  root.appendChild(fullSet);

  for (const [countryCode, senders] of Object.entries(stats.sendersByCountry)) {
    const subset = doc.createElement('Subset');
    subset.setAttribute('type', 'PerEUC');
    subset.appendChild(el(doc, 'Key', countryCode, { metaSchemeID: 'CC', schemeID: 'EndUserCountry' }));
    for (const n of buildEndUserCounts(doc, senders)) subset.appendChild(n);
    root.appendChild(subset);
  }

  for (const [key, senders] of Object.entries(stats.sendersByDocumentTypeCountry)) {
    const [documentType, countryCode] = key.split('|');
    const subset = doc.createElement('Subset');
    subset.setAttribute('type', 'PerDT-EUC');
    subset.appendChild(el(doc, 'Key', documentType, { metaSchemeID: 'DT', schemeID: 'busdox-docid-qns' }));
    subset.appendChild(el(doc, 'Key', countryCode,  { metaSchemeID: 'CC', schemeID: 'EndUserCountry' }));
    for (const n of buildEndUserCounts(doc, senders)) subset.appendChild(n);
    root.appendChild(subset);
  }

  for (const [key, senders] of Object.entries(stats.sendersByDocumentTypeProcessId)) {
    const [documentType, processId] = key.split('|');
    const subset = doc.createElement('Subset');
    subset.setAttribute('type', 'PerDT-PR');
    subset.appendChild(el(doc, 'Key', documentType, { metaSchemeID: 'DT', schemeID: 'busdox-docid-qns' }));
    subset.appendChild(el(doc, 'Key', processId,  { metaSchemeID: 'PR', schemeID: 'cenbii-procid-ubl' }));
    for (const n of buildEndUserCounts(doc, senders)) subset.appendChild(n);
    root.appendChild(subset);
  }

  for (const [key, senders] of Object.entries(stats.sendersByDocumentTypeProcessIdCountry)) {
    const [documentType, processId, countryCode] = key.split('|');
    const subset = doc.createElement('Subset');
    subset.setAttribute('type', 'PerDT-PR-EUC');
    subset.appendChild(el(doc, 'Key', documentType, { metaSchemeID: 'DT', schemeID: 'busdox-docid-qns' }));
    subset.appendChild(el(doc, 'Key', processId,  { metaSchemeID: 'PR', schemeID: 'cenbii-procid-ubl' }));
    subset.appendChild(el(doc, 'Key', countryCode,  { metaSchemeID: 'CC', schemeID: 'EndUserCountry' }));
    for (const n of buildEndUserCounts(doc, senders)) subset.appendChild(n);
    root.appendChild(subset);
  }

  doc.appendChild(root);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(doc);
}

export function buildTransactionReport(stats, senderCN) {
  const dom  = new DOMImplementation();

  const doc  = dom.createDocument('urn:fdc:peppol:transaction-statistics-report:1.0', null, null);
  const root = doc.createElementNS('urn:fdc:peppol:transaction-statistics-report:1.0', 'TransactionStatisticsReport');

  root.appendChild(el(doc, 'CustomizationID', 'urn:fdc:peppol.eu:edec:trns:transaction-statistics-reporting:1.0'));
  root.appendChild(el(doc, 'ProfileID',       'urn:fdc:peppol.eu:edec:bis:reporting:1.0'));
  root.appendChild(buildReportHeader(doc, stats.fromDate, stats.toDate, senderCN));

  const total = doc.createElement('Total');
  total.appendChild(el(doc, 'Incoming', '0'));
  total.appendChild(el(doc, 'Outgoing', String(stats.outgoing)));
  root.appendChild(total);

  for (const [transportProfile, outgoing] of Object.entries(stats.outgoingByTransportProfile)) {
    const subtotal = doc.createElement('Subtotal');
    subtotal.setAttribute('type', 'PerTP');
    subtotal.appendChild(el(doc, 'Key',      transportProfile, { metaSchemeID: 'TP', schemeID: 'Peppol' }));
    subtotal.appendChild(el(doc, 'Incoming', '0'));
    subtotal.appendChild(el(doc, 'Outgoing', String(outgoing)));
    root.appendChild(subtotal);
  }

  for (const [key, outgoing] of Object.entries(stats.outgoingByReceiverCommonNameDocumentTypeProcessId)) {
    const [receiverCommonName, documentType, processId] = key.split('|');
    const subtotal = doc.createElement('Subtotal');
    subtotal.setAttribute('type', 'PerSP-DT-PR');
    subtotal.appendChild(el(doc, 'Key',      receiverCommonName, { metaSchemeID: 'SP', schemeID: 'CertSubjectCN' }));
    subtotal.appendChild(el(doc, 'Key',      documentType,       { metaSchemeID: 'DT', schemeID: 'busdox-docid-qns' }));
    subtotal.appendChild(el(doc, 'Key',      processId,          { metaSchemeID: 'PR', schemeID: 'cenbii-procid-ubl' }));
    subtotal.appendChild(el(doc, 'Incoming', '0'));
    subtotal.appendChild(el(doc, 'Outgoing', String(outgoing)));
    root.appendChild(subtotal);
  }

  doc.appendChild(root);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(doc);
}

export async function generateReports(context, fromDate, toDate) {
  db = await getDb();

  const certPath = path.join(getUserCertsDir(), 'cert.pem');
  if (!fs.existsSync(certPath)) {
    throw new N42Error(N42ErrorCode.CERT_NOT_FOUND, { details: 'Sender' });
  }
  const cert   = fs.readFileSync(certPath);
  const senderCN   = getCertCommonName(cert);

  const stats      = aggregateStats(await db.getAll('transactions'), fromDate, toDate);
  const from       = fromDate instanceof Date ? fromDate.toISOString().slice(0, 10) : fromDate;
  const to         = toDate   instanceof Date ? toDate.toISOString().slice(0, 10)   : toDate;
  const outDir     = getUserReportsDir();

  const endUserReportPath = path.join(outDir, `end_user_${from}_${to}.xml`);
  const transactionsReportPath = path.join(outDir, `transactions_${from}_${to}.xml`);

  context.spinner.start('Generating Reports');
  const endUserReport = buildEndUserReport(stats, senderCN);
  const transactionsReport = buildTransactionReport(stats, senderCN);
  context.spinner.done('Generated Reports');

  let validationErrors;

  context.spinner.start('Validating End-User Report');
  validationErrors = await validateDocument(context, endUserReport, { ruleSet: 'reporting' });
  context.spinner.done('Validated End-User Report', validationErrors.length === 0);

  context.spinner.start('Validating Transactions Report');
  validationErrors = await validateDocument(context, endUserReport, { ruleSet: 'reporting' });
  context.spinner.done('Validated Transactions Report', validationErrors.length === 0);
  
  fs.writeFileSync(endUserReportPath, endUserReport);
  fs.writeFileSync(transactionsReportPath, transactionsReport);

  return { endUserReportPath, transactionsReportPath };
}