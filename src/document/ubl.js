/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import fs   from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { getParticipantValue }      from '../core/utils.js';
import { getUserTemplatesDir }      from '../cli/paths.js';
import { SBDH_NS, CAC, CBC }        from '../core/constants.js';

import { 
  N42Error, 
  N42ErrorCode 
} from '../core/error.js';

const parser     = new DOMParser();
const serializer = new XMLSerializer();

// ── UBL helpers ──────────────────────────────────────────────────────────────

function cbc(doc, tag, text, attrs = {}) {
  const el = doc.createElementNS(CBC, `cbc:${tag}`);
  el.textContent = String(text);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function cac(doc, tag) {
  return doc.createElementNS(CAC, `cac:${tag}`);
}

function amount(doc, tag, val, currency) {
  const el = cbc(doc, tag, val);
  el.setAttribute('currencyID', currency);
  return el;
}

function fmt(n) {
  return Number(n).toFixed(2);
}

// ── Build invoice ─────────────────────────────────────────────────────────────

export function buildDocument(context) {
  context.spinner.start('Loading Datafile');

  const ublPath = context.ubl
    ? path.resolve(context.ubl)
    : path.join(getUserTemplatesDir(), 'ubl.json');

  if (!fs.existsSync(ublPath)) {
    throw new N42Error(N42ErrorCode.FILE_NOT_FOUND,
      { details: `UBL descriptor: ${ublPath}. Run 'n42-edelivery init' to create a default one.` },
      { retryable: false }
    );
  }

  const data = JSON.parse(fs.readFileSync(ublPath, 'utf-8'));
  context.spinner.done('Loaded Datafile');
  context.spinner.start('Building Document');

  const { seller: s, buyer: b, invoice: inv } = data;
  const { items, currency } = inv;

  context.documentType = data.document_type;
  context.processId    = data.process_id;

  // Totals
  let netTotal = 0, vatTotal = 0;
  for (const item of items) {
    const net = parseFloat(item.net_amount);
    netTotal += net;
    vatTotal += net * parseFloat(item.vat_percent) / 100;
  }
  const grossTotal = netTotal + vatTotal;

  const senderEndpoint   = context.senderId?.includes('::')   ? context.senderId.split('::')[1]   : context.senderId;
  const receiverEndpoint = context.receiverId?.includes('::') ? context.receiverId.split('::')[1] : context.receiverId;
  const sellerCountry    = context.senderCountry ?? s.country ?? 'SE';

  const UBL   = context.documentType.split('::')[0];
  const doc   = parser.parseFromString(`<Invoice xmlns="${UBL}" xmlns:cac="${CAC}" xmlns:cbc="${CBC}"/>`, 'application/xml');
  const root  = doc.documentElement;

  root.appendChild(cbc(doc, 'CustomizationID', 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0'));
  root.appendChild(cbc(doc, 'ProfileID', 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'));
  root.appendChild(cbc(doc, 'ID', randomUUID().slice(0, 8).toUpperCase()));
  root.appendChild(cbc(doc, 'IssueDate', new Date().toISOString().slice(0, 10)));
  root.appendChild(cbc(doc, 'DueDate',   new Date().toISOString().slice(0, 10)));
  root.appendChild(cbc(doc, 'InvoiceTypeCode', '380'));
  root.appendChild(cbc(doc, 'DocumentCurrencyCode', currency));
  root.appendChild(cbc(doc, 'BuyerReference', 'test'));

  // Seller
  const supplier = cac(doc, 'AccountingSupplierParty');
  const party    = cac(doc, 'Party');
  const ep = cbc(doc, 'EndpointID', senderEndpoint, { schemeID: s.endpoint_scheme });
  party.appendChild(ep);
  const pn = cac(doc, 'PartyName'); pn.appendChild(cbc(doc, 'Name', s.name)); party.appendChild(pn);
  const addr = cac(doc, 'PostalAddress');
  addr.appendChild(cbc(doc, 'StreetName', s.street));
  addr.appendChild(cbc(doc, 'CityName',   s.city));
  addr.appendChild(cbc(doc, 'PostalZone', s.zip));
  const country = cac(doc, 'Country'); country.appendChild(cbc(doc, 'IdentificationCode', sellerCountry)); addr.appendChild(country);
  party.appendChild(addr);
  const pts = cac(doc, 'PartyTaxScheme');
  pts.appendChild(cbc(doc, 'CompanyID', s.vat));
  const ts = cac(doc, 'TaxScheme'); ts.appendChild(cbc(doc, 'ID', 'VAT')); pts.appendChild(ts);
  party.appendChild(pts);
  const ple = cac(doc, 'PartyLegalEntity');
  ple.appendChild(cbc(doc, 'RegistrationName', s.name));
  ple.appendChild(cbc(doc, 'CompanyID', s.company_id));
  party.appendChild(ple);
  supplier.appendChild(party);
  root.appendChild(supplier);

  // Buyer
  const customer = cac(doc, 'AccountingCustomerParty');
  const bparty   = cac(doc, 'Party');
  const bep = cbc(doc, 'EndpointID', receiverEndpoint, { schemeID: b.endpoint_scheme });
  bparty.appendChild(bep);
  const bpn = cac(doc, 'PartyName'); bpn.appendChild(cbc(doc, 'Name', b.name)); bparty.appendChild(bpn);
  const baddr = cac(doc, 'PostalAddress');
  baddr.appendChild(cbc(doc, 'StreetName', b.street));
  baddr.appendChild(cbc(doc, 'CityName',   b.city));
  baddr.appendChild(cbc(doc, 'PostalZone', b.zip));
  const bcountry = cac(doc, 'Country'); bcountry.appendChild(cbc(doc, 'IdentificationCode', b.country)); baddr.appendChild(bcountry);
  bparty.appendChild(baddr);
  const bple = cac(doc, 'PartyLegalEntity');
  bple.appendChild(cbc(doc, 'RegistrationName', b.name));
  bple.appendChild(cbc(doc, 'CompanyID', b.company_id));
  bparty.appendChild(bple);
  customer.appendChild(bparty);
  root.appendChild(customer);

  // Payment means
  const pm = cac(doc, 'PaymentMeans');
  pm.appendChild(cbc(doc, 'PaymentMeansCode', inv.payment_means));
  root.appendChild(pm);

  // Tax total
  const tt = cac(doc, 'TaxTotal');
  tt.appendChild(amount(doc, 'TaxAmount', fmt(vatTotal), currency));
  const rates = {};
  for (const item of items) {
    const rate = parseFloat(item.vat_percent);
    rates[rate] = (rates[rate] ?? 0) + parseFloat(item.net_amount);
  }
  for (const [rate, taxable] of Object.entries(rates)) {
    const vat = taxable * parseFloat(rate) / 100;
    const ts2 = cac(doc, 'TaxSubtotal');
    ts2.appendChild(amount(doc, 'TaxableAmount', fmt(taxable), currency));
    ts2.appendChild(amount(doc, 'TaxAmount', fmt(vat), currency));
    const tc = cac(doc, 'TaxCategory');
    tc.appendChild(cbc(doc, 'ID', 'S'));
    tc.appendChild(cbc(doc, 'Percent', String(rate)));
    const tcs = cac(doc, 'TaxScheme'); tcs.appendChild(cbc(doc, 'ID', 'VAT')); tc.appendChild(tcs);
    ts2.appendChild(tc);
    tt.appendChild(ts2);
  }
  root.appendChild(tt);

  // Monetary total
  const lmt = cac(doc, 'LegalMonetaryTotal');
  lmt.appendChild(amount(doc, 'LineExtensionAmount', fmt(netTotal),   currency));
  lmt.appendChild(amount(doc, 'TaxExclusiveAmount',  fmt(netTotal),   currency));
  lmt.appendChild(amount(doc, 'TaxInclusiveAmount',  fmt(grossTotal), currency));
  lmt.appendChild(amount(doc, 'PayableAmount',       fmt(grossTotal), currency));
  root.appendChild(lmt);

  // Lines
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const line = cac(doc, 'InvoiceLine');
    line.appendChild(cbc(doc, 'ID', String(i + 1)));
    const iq = cbc(doc, 'InvoicedQuantity', String(item.quantity), { unitCode: item.unit ?? 'EA' });
    line.appendChild(iq);
    line.appendChild(amount(doc, 'LineExtensionAmount', item.net_amount, currency));
    const it   = cac(doc, 'Item');
    it.appendChild(cbc(doc, 'Name', item.name));
    const itc  = cac(doc, 'ClassifiedTaxCategory');
    itc.appendChild(cbc(doc, 'ID', 'S'));
    itc.appendChild(cbc(doc, 'Percent', String(item.vat_percent)));
    const itts = cac(doc, 'TaxScheme'); itts.appendChild(cbc(doc, 'ID', 'VAT')); itc.appendChild(itts);
    it.appendChild(itc);
    line.appendChild(it);
    const price = cac(doc, 'Price');
    price.appendChild(amount(doc, 'PriceAmount', item.unit_price, currency));
    line.appendChild(price);
    root.appendChild(line);
  }

  context.spinner.done('Built Document');
  return { context, xml: Buffer.from(serializer.serializeToString(doc)) };
}

// ── SBDH strip ────────────────────────────────────────────────────────────────

export function stripSbdh(docNode) {
  const sbdh = docNode.getElementsByTagNameNS(SBDH_NS, 'StandardBusinessDocumentHeader')[0];
  if (!sbdh) throw new N42Error(N42ErrorCode.DOC_INVALID, 'No header (SBDH) found to strip');

  const parent   = sbdh.parentNode;
  const children = Array.from(parent.childNodes).filter(n => n !== sbdh && n.nodeType === 1);
  if (!children.length) throw new N42Error(N42ErrorCode.DOC_INVALID, { details: 'No payload element found inside StandardBusinessDocument' });
  return children[0];
}

// ── SBDH wrap ─────────────────────────────────────────────────────────────────

export function wrapInSbdh(context, docNode) {
  const localName  = docNode.localName;
  const namespace  = docNode.namespaceURI;
  const docTypeVer = context.documentType.split(':').pop();

  const doc  = parser.parseFromString(`<StandardBusinessDocument xmlns="${SBDH_NS}"/>`, 'application/xml');
  const sbd  = doc.documentElement;

  const s = (tag, text = null) => {
    const node = doc.createElementNS(SBDH_NS, tag);
    if (text !== null) node.textContent = text;
    return node;
  };

  const sbdh = s('StandardBusinessDocumentHeader');
  sbdh.appendChild(s('HeaderVersion', '1.0'));

  const sender = s('Sender');
  const sId    = s('Identifier', getParticipantValue(context.senderId));
  sId.setAttribute('Authority', 'iso6523-actorid-upis');
  sender.appendChild(sId);
  sbdh.appendChild(sender);

  const receiver = s('Receiver');
  const rId      = s('Identifier', getParticipantValue(context.receiverId));
  rId.setAttribute('Authority', 'iso6523-actorid-upis');
  receiver.appendChild(rId);
  sbdh.appendChild(receiver);

  const docId = s('DocumentIdentification');
  docId.appendChild(s('Standard',            namespace));
  docId.appendChild(s('TypeVersion',         docTypeVer));
  docId.appendChild(s('InstanceIdentifier',  context.id));
  docId.appendChild(s('Type',                localName));
  docId.appendChild(s('CreationDateAndTime', context.timestamp));
  sbdh.appendChild(docId);

  const bizScope = s('BusinessScope');
  const addScope = (type, instanceId, identifier) => {
    const scope = s('Scope');
    scope.appendChild(s('Type',               type));
    scope.appendChild(s('InstanceIdentifier', instanceId));
    scope.appendChild(s('Identifier',         identifier));
    bizScope.appendChild(scope);
  };
  addScope('DOCUMENTID', context.documentType, 'busdox-docid-qns');
  addScope('PROCESSID',  context.processId,    'cenbii-procid-ubl');
  addScope('COUNTRY_C1', context.senderCountry, '');
  sbdh.appendChild(bizScope);

  sbd.appendChild(sbdh);

  // Import the document node
  const docElement = docNode.nodeType === 9 ? docNode.documentElement : docNode;
  const imported = doc.importNode(docElement, true);
  sbd.appendChild(imported);

  return { xml: serializer.serializeToString(doc), node: sbd };
}
