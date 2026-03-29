/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: AGPL-3.0-only
*/

import fs    from 'fs';
import path  from 'path';

import { N42Timer }          from './cli/timer.js';
import { N42Context }        from './model/context.js';
import { N42Environment }    from './model/environment.js';
import { Spinner }           from './cli/spinner.js';
import { c, C }              from './cli/color.js';
import { buildDocument }     from './document/ubl.js';
import { sendDocument }      from './sender/sender.js';
import { sendAs4Message }    from './sender/as4.js';
import { generateReports }   from './report.js';

import { 
  generateChain, 
  generateIntermediateCa,
  generateRootCa,
  generateCert 
} from './security/chain.js';

import { 
    isValidDate,
    normalizeFilename,
    getParticipantValue, 
    checkRequiredForSend, 
    checkRequiredForCertChain,
    checkRequiredForCertRoot,
    checkRequiredForCertCa,
} from './core/utils.js'

import { 
  validateDocument, 
  convertSchematronToXsl 
}  from './document/validator.js';

import { 
  getCertDetails, 
  getKeyDetails,
  getTruststoreDetails 
} from './security/pki.js';

import { 
  printHeader,
  printArtefacts,
  printSignalMessage,
  printCertInfo
} from './cli/output.js';

import {
  initWorkspace, 
  initUserCerts, 
  initUserSchematrons, 
  initUserTemplates, 
  destExists,
  ensureDir, 
  initShellCompletion,
  getUserTransactionsDir,
  getUserValidationsDir,
  getUserCertsDir,
  getUserHomeDir
} from './cli/paths.js';

import { 
  N42Error, 
  N42ErrorCode,
  handleError 
} from './core/error.js';

const runtimeEnv = new N42Environment();
const timer = new N42Timer();

/**
 * Register CLI commands on the commander program instance.
 * @param {import('commander').Command} program
 */
export function registerCommands(program) {
    
    // ── initialize ──────────────────────────────────────────────────────────────

    program.command('init')
    .description('Initialize local Node42 workspace with certificates,\nschematrons, and JSON invoice control structure')
    .action(async () => {
        printHeader('Node42 — eDelivery');
        initWorkspace(true);
        console.log();
    });

    // ── completion ──────────────────────────────────────────────────────────────

    program
    .command("completion <shell>")
    .description("Install shell completion")
    .action((shell) => {
        if (shell !== "bash") {
            throw new N42Error(N42ErrorCode.INVALID_INPUT, { details: `Only bash supported` });
        }
        initShellCompletion();
    });

    // ── cert/chain ──────────────────────────────────────────────────────────────

    const certCmd = program.command('cert').description('Certificate utilities');
    const generateCmd = certCmd.command('generate').description('Generate certificates');
    const peppolCert = generateCmd.command('peppol').description('Generate a Peppol-compatible certificate chain');

    peppolCert
    .option('--type <type>',      'Certificate type: chain | leaf | ca | root', 'chain')
    .option('--service <name>',   'Service identifier (used in cert metadata)')
    .option('--org <name>',       'Organization name(s) for certificate subject')
    .option('--country <code>',   'Country code (ISO 3166-1 alpha-2, e.g. SE)')
    .option('--dns-name <name>',  'DNS name / SAN entry for the certificate', 'ap.node42.xyz')
    .option('--cn <name>',        'Common Name (CN) for the leaf certificate')
    .option('--caCert <path>',    'CA Certtificate PEM path', 'ca.pem')
    .option('--caKey <path>',     'CA Private Key PEM path', 'caKey.pem')
    .option('--rootCert <path>',  'Root PEM path', 'root.pem')
    .option('--rootKey <path>',   'Root Private Key PEM path', 'rootKey.pem')
    .option('-v, --verbose',      'Enable detailed output')
    .action((opts) => {  
        const spinner = new Spinner();
        const context = new N42Context({
            role: 'sender',
            spinner, 
            verbose: opts.verbose   ?? false,
            runtimeEnv,
        });  

        const { type } = opts;
        printHeader(`Generating Certificate (type: ${type})`);

        try {

          switch(type) {
            case 'chain': {
              const missing = checkRequiredForCertChain(opts);
              if (missing.length) {
                  throw new N42Error(N42ErrorCode.INVALID_INPUT, { details: `Missing required field(s): ${c(C.BOLD, missing.join(', '))}` });
              }

              const { root, ica, leaf } = generateChain(opts.service, opts.org, opts.country, opts.cn ?? null, opts.dnsName);
              const truststorePem = ica.certPem + root.certPem;

              const outDir = ensureDir(path.join(getUserCertsDir(), leaf.commonName));
              fs.writeFileSync(path.join(outDir, `truststore.pem`), truststorePem);
              fs.writeFileSync(path.join(outDir, `cert.pem`), leaf.certPem);
              fs.writeFileSync(path.join(outDir, `key.pem`), leaf.privKeyPem);
              
              context.cert = path.join(outDir, 'cert.pem');
              context.key = path.join(outDir, 'key.pem');
              context.truststore = path.join(outDir, 'truststore.pem');

              context.senderCert = leaf.certPem;
              context.senderKey = leaf.privKeyPem;

              const certDetails = getCertDetails(context);
              const keyDetails = getKeyDetails(context);
              const truststoreDetails = getTruststoreDetails(context);

              printCertInfo(certDetails, keyDetails, truststoreDetails, context.verbose);
              break;
            }

            case 'root': {
              const missing = checkRequiredForCertRoot(opts);
              if (missing.length) {
                  throw new N42Error(N42ErrorCode.INVALID_INPUT, { details: `Missing required field(s): ${c(C.BOLD, missing.join(', '))}` });
              }
              const root = generateRootCa({ org: opts.org, country: opts.country });
              
              const outDir = getUserCertsDir();
              fs.writeFileSync(path.join(outDir, `root.pem`), root.certPem);
              fs.writeFileSync(path.join(outDir, `rootKey.pem`), root.privKeyPem);
              
              context.truststore = path.join(outDir, 'root.pem');
              const truststoreDetails = getTruststoreDetails(context);

              printCertInfo(null, null, truststoreDetails, context.verbose);
              break;
            }

            case 'ca': {
              const missing = checkRequiredForCertCa(opts);
              if (missing.length) {
                  throw new N42Error(N42ErrorCode.INVALID_INPUT, { details: `Missing required field(s): ${c(C.BOLD, missing.join(', '))}` });
              }

              const rootPath = path.resolve(opts.rootCert);
              if (!fs.existsSync(rootPath)) {
                  throw new N42Error(N42ErrorCode.CERT_NOT_FOUND, { details: `Root certificate not present in ${c(C.BOLD, path.dirname(rootPath))}` });
              }
              const rootPem = fs.readFileSync(rootPath);

              const rootKeyPath = path.resolve(opts.rootKey);
              if (!fs.existsSync(rootKeyPath)) {
                  throw new N42Error(N42ErrorCode.CERT_NOT_FOUND, { details: `Root Private Key not present in ${c(C.BOLD, path.dirname(rootKeyPath))}` });
              }
              const rootPrivKeyPem = fs.readFileSync(rootKeyPath);
             
              const ica  = generateIntermediateCa({ service: opts.service, org: opts.org, country: opts.country, rootCertPem: rootPem, rootKeyPem: rootPrivKeyPem });
            
              const outDir = getUserCertsDir();  
              fs.writeFileSync(path.join(outDir, `ca.pem`), ica.certPem);
              fs.writeFileSync(path.join(outDir, `caKey.pem`), ica.privKeyPem);
              
              context.truststore = path.join(outDir, 'ca.pem');
              const truststoreDetails = getTruststoreDetails(context);

              printCertInfo(null, null, truststoreDetails, context.verbose);
              break;
            }

            case 'leaf': {
              const missing = checkRequiredForCertChain(opts);
              if (missing.length) {
                  throw new N42Error(N42ErrorCode.INVALID_INPUT, { details: `Missing required field(s): ${c(C.BOLD, missing.join(', '))}` });
              }

              const caPath = path.resolve(opts.caCert);
              if (!fs.existsSync(caPath)) {
                  throw new N42Error(N42ErrorCode.CERT_NOT_FOUND, { details: `CA certificate not present in ${c(C.BOLD, path.dirname(caPath))}` });
              }
              const caPem = fs.readFileSync(caPath);

              const caKeyPath = path.resolve(opts.caKey);
              if (!fs.existsSync(caKeyPath)) {
                  throw new N42Error(N42ErrorCode.CERT_NOT_FOUND, { details: `CA Private Key not present in ${c(C.BOLD, path.dirname(caKeyPath))}` });
              }
              const caPrivKeyPem = fs.readFileSync(caKeyPath);

              const leaf = generateCert({ service: opts.service, org: opts.org, country: opts.country, cn: opts.cn ?? null, dnsName: opts.dnsName, caCertPem: caPem, caKeyPem: caPrivKeyPem });

              const outDir = ensureDir(path.join(getUserCertsDir(), leaf.commonName));
              fs.writeFileSync(path.join(outDir, `cert.pem`), leaf.certPem);
              fs.writeFileSync(path.join(outDir, `key.pem`), leaf.privKeyPem);
              
              context.cert = path.join(outDir, 'cert.pem');
              context.key = path.join(outDir, 'key.pem');

              context.senderCert = leaf.certPem;
              context.senderKey = leaf.privKeyPem;

              const certDetails = getCertDetails(context);
              const keyDetails = getKeyDetails(context);

              printCertInfo(certDetails, keyDetails, null, context.verbose);
              break;
            }
          }
        }
        catch(e) {
            handleError(e);
        }
    });

    // ── pki ──────────────────────────────────────────────────────────────

    program
    .command("pki")
    .option('-v, --verbose', 'Enable detailed output')
    .description("Display PKI configuration — certificate, private key and truststore\nused for AS4 signing, encryption and peer validation")
    .action((opts) => {
        const spinner = new Spinner();
        const context = new N42Context({
            role: 'sender',
            spinner, 
            verbose: opts.verbose   ?? false,
            runtimeEnv,
        });
        
        const certsDir = getUserCertsDir();
        try {

            context.cert = path.join(certsDir, 'cert.pem');
            if (!fs.existsSync(context.cert)) {
                throw new N42Error(N42ErrorCode.CERT_NOT_FOUND, { details: `Sender certificate not present in ${c(C.BOLD, certsDir)}` });
            }
            context.senderCert = fs.readFileSync(context.cert);

            context.key = path.join(certsDir, 'key.pem');
            if (!fs.existsSync(context.key)) {
                throw new N42Error(N42ErrorCode.KEY_NOT_FOUND, { details: `Sender key not present in ${c(C.BOLD, certsDir)}` });   
            }
            context.senderKey = fs.readFileSync(context.key);

            context.truststore = path.join(certsDir, 'truststore.pem');
            if (!fs.existsSync(context.truststore)) {
                throw new N42Error(N42ErrorCode.CERT_NOT_FOUND, { details: `Truststore bundle not present in ${c(C.BOLD, certsDir)}` });   
            }
           
            const certDetails = getCertDetails(context);
            const keyDetails = getKeyDetails(context);
            const truststoreDetails = getTruststoreDetails(context);

            printCertInfo(certDetails, keyDetails, truststoreDetails, context.verbose);
        }
        catch(e) {
           handleError(e);
        }
    });

    // ── replay ──────────────────────────────────────────────────────────────

    program
    .command("replay [transactionId]")
    .description("Re-send a previously sent transaction using stored artefacts")
    .action(async (id) => {
        const spinner = new Spinner();
        const srcDir = getUserTransactionsDir();
        try {

            const replayFile = path.join(getUserHomeDir(), `replay.json`);
            if (!fs.existsSync(replayFile)) {
                throw new N42Error(N42ErrorCode.FILE_NOT_FOUND, 
                    { details: `: ${c(C.BOLD, replayFile)}` }, 
                    { retryable: false }
                );
            }

            const replayInfo = JSON.parse(fs.readFileSync(replayFile, 'utf8').trim());
            const transactionId = id ? id : replayInfo.id;

            console.log(`${c(C.BOLD, "Replaying message")}: ${transactionId}\n`);
            console.log(`  Sender   : ${c(C.BLUE, getParticipantValue(replayInfo.sender))}`);
            console.log(`  Receiver : ${c(C.BLUE, getParticipantValue(replayInfo.receiver))}\n`);
            console.log(`  Endpoint : ${c(C.DIM, getParticipantValue(replayInfo.endpoint))}\n`)

            spinner.start('Loading Context');
            const contextFile = path.join(srcDir, `${transactionId}_context.json`);
            if (!fs.existsSync(contextFile)) {
                spinner.fail('Loading Context Failed');
                throw new N42Error(N42ErrorCode.FILE_NOT_FOUND,
                    { details: `Transaction context artefact: ${c(C.BOLD, contextFile)}` },
                    { retryable: false }
                );
            }
            const context = JSON.parse(fs.readFileSync(contextFile));
                    context.spinner = new Spinner();
                    context.persist = true;
                    context.runtimeEnv = runtimeEnv;
                    context.timer = timer;
            
            spinner.done('Loaded Context');

            spinner.start('Loading Message Headers');
            const headersFile = path.join(srcDir, `${transactionId}_message_headers.json`);
            if (!fs.existsSync(headersFile)) {
                spinner.fail('Loading Message Headers Failed');
                throw new N42Error(N42ErrorCode.FILE_NOT_FOUND,
                    { details: `Message headers artefact: ${c(C.BOLD, headersFile)}` },
                    { retryable: false }
                );
            }
            const headers = JSON.parse(fs.readFileSync(headersFile));
            spinner.done('Loaded Message Headers');
            
            spinner.start('Loading Message Body');
            const bodyFile = path.join(srcDir, `${transactionId}_message_body.txt`);
            if (!fs.existsSync(bodyFile)) {
                spinner.fail('Loading Message Body Failed');
                throw new N42Error(N42ErrorCode.FILE_NOT_FOUND,
                    { details: `Message body artefact: ${c(C.BOLD, bodyFile)}` },
                    { retryable: false }
                );
            }
            const body = fs.readFileSync(bodyFile);
            spinner.done('Loaded Message Body');

            timer.mark('Initialized');

            await sendAs4Message(context, headers, body);

            if (context.persist) {
                console.log();
                printArtefacts(context);
            }

            timer.done();
        }
        catch(e) {
           handleError(e);
        }
    });

    // ── convert ──────────────────────────────────────────────────────────────

    const convertCmd = program.command('convert').description('Convert schematron files');
    const convertSch = convertCmd.command('sch').description('Convert .sch schematron to .xsl');

    convertSch
    .argument('<path>', 'Path to .sch schematron file')
    .action(async (schPath) => {
        const spinner = new Spinner();
        const context = new N42Context({
            spinner,
            runtimeEnv, 
        });

        console.log(`${c(C.BOLD, "Convert schematron")}: ${path.basename(schPath)}\n`)

        try { 
            await convertSchematronToXsl(context, schPath);
            console.log(); 
        }
        catch(e) {
            handleError(e);
        }
    });

    // ── peppol reporting ──────────────────────────────────────────────────────────────

    const reportCmd = program.command('report').description('Generate reporting data');
    const peppolReport = reportCmd.command('peppol').description('Generate Peppol reporting data');

    peppolReport
    .option('--from <yyyy-mm-dd>', 'Start date of the reporting period')
    .option('--to <yyyy-mm-dd>', 'End date of the reporting period')
    .action(async (options) => {
        const spinner = new Spinner();
        const context = new N42Context({
            spinner,
            runtimeEnv, 
        });

        try {

            if (!options.from || !options.to) {
                throw new N42Error(
                    N42ErrorCode.INVALID_INPUT,
                    { details: "--from and --to are required" }
                );
            }

            if (!isValidDate(options.from) || !isValidDate(options.to)) {
                throw new N42Error(
                N42ErrorCode.INVALID_INPUT,
                { details: "Dates must be valid ISO dates in format YYYY-MM-DD" }
                );
            }

            console.log(`${c(C.BOLD, "Peppol reporting")}: ${options.from} → ${options.to}\n`)

            const { endUserReportPath, transactionsReportPath } = await generateReports(context, options.from, options.to);

            const linkTransactionsReport = `\u001B]8;;file://${transactionsReportPath}\u0007View\u001B]8;;\u0007`;
            const linkEndUserReport = `\u001B]8;;file://${endUserReportPath}\u0007View\u001B]8;;\u0007`;

            console.log();
            console.log(`  ${C.BOLD}REPORTS${C.RESET}`);
            console.log(`  Transactions ${c(C.BLUE, `[${linkTransactionsReport}]`)}`);
            console.log(`  End-User     ${c(C.BLUE, `[${linkEndUserReport}]`)}`);
            console.log();
        }
        catch(e) {
            handleError(e);
        }
        
    });

    // ── send peppol ──────────────────────────────────────────────────────────────

    const sendCmd = program.command('send').description('Send a document');
    const peppolSend = sendCmd.command('peppol').description('Send a Peppol UBL document via AS4');

    peppolSend
    .option('-e, --env <env>',        'Target environment: prod or test', 'test')
    .option('-d, --document <path>',  'Path to UBL XML document')
    .option('--ubl <path>',           'Path to UBL document descriptor')
    .option('--schematron <xsl...>',  'Schematron XSL files for validation')
    .option('--cert-id <uuid>',       'Probe certificate ID')
    .option('--cert <path>',          'Certificate PEM path', 'cert.pem')
    .option('--key <path>',           'Private key PEM path', 'key.pem')
    .option('--key-pass <secret>',    'Private key passphrase', '')
    .option('--truststore <path>',    'Truststore PEM path', '')
    .option('--sender-id <id>',       'Sender participant ID')
    .option('--receiver-id <id>',     'Receiver participant ID')
    .option('--sender-country <cc>',  'Sender country code')
    .option('--endpoint-url <url>',   'Override SMP endpoint URL')
    .option('--hostname <host>',      'Hostname for message IDs')
    .option('--strip-sbdh',           'Strip and re-wrap existing SBDH')
    .option('--dryrun',               'Prepare but do not transmit')
    .option('-p, --persist',          'Persist transaction data to disk')
    .option('-v, --verbose',          'Enable detailed output')
    .action(async (opts) => {
        const spinner = new Spinner();
        const context = new N42Context({
            command:       'send',
            subcommand:    'peppol',
            env:           opts.env,
            document:      opts.document,
            ubl:           opts.ubl,
            schematron:    opts.schematron ?? [],
            certId:        opts.certId,
            cert:          opts.cert,
            key:           opts.key,
            keyPass:       opts.keyPass,
            truststore:    opts.truststore,
            senderId:      opts.senderId,
            receiverId:    opts.receiverId,
            senderCountry: opts.senderCountry,
            endpointUrl:   opts.endpointUrl,
            hostname:      opts.hostname,
            stripSbdh:     opts.stripSbdh ?? false,
            dryrun:        opts.dryrun    ?? false,
            persist:       opts.persist   ?? false,
            verbose:       opts.verbose   ?? false,
            spinner,
            timer,
            runtimeEnv,
        });

        printHeader('Node42 — eDelivery');

        initUserCerts(context);
        initUserSchematrons(context);
        initUserTemplates(context);

        timer.mark('Initialized');

        try {

            let document;
            if (context.document && destExists(context.document)) {
                spinner.start('Loading Document');
                document = fs.readFileSync(context.document);
                spinner.done('Loaded Document');
            } 
            else {

                const missing = checkRequiredForSend(opts);
                if (missing.length) {
                    throw new N42Error(N42ErrorCode.INVALID_INPUT, { details: `Missing required field(s): ${c(C.BOLD, missing.join(', '))}` });
                }

                const res = buildDocument(context);
                document  = res.xml;

                if (context.persist) {
                    const outDir = getUserTransactionsDir();
                    fs.writeFileSync(path.join(outDir, `${context.id}_document.xml`), document);
                }
            }

            timer.mark('Built document');

            await sendDocument(context, document);
            console.log();

            if (context.signalMessage) {
                printSignalMessage(context);
            }

            if (context.persist) {
                printArtefacts(context);
            }
            
            timer.done();

        } 
        catch(e) {
            if (context.signalMessage) {
                printSignalMessage(context);
            } else {
                handleError(e);
                process.exit(1);
            }
        }
    });

    // ── validate peppol ──────────────────────────────────────────────────────────

    const validateCmd = program.command('validate').description('Validate a document');
    const peppolValidate = validateCmd.command('peppol').description('Validate a Peppol UBL document');

    peppolValidate
    .requiredOption('--document <path>', 'Path to UBL XML document')
    .option('--schematron <xsl...>',     'Schematron XSL files')
    .option('-p, --persist',             'Persist validation errors to disk')
    .option('-v, --verbose',             'Enable detailed output')
    .action(async (opts) => {
        const spinner = new Spinner();
        const context = new N42Context({
            command:    'validate',
            subcommand: 'peppol',
            document:   opts.document,
            schematron: opts.schematron ?? [],
            persist:    opts.persist ?? false,
            verbose:    opts.verbose ?? false,
            spinner,
            runtimeEnv,
        });

        const fileName = path.basename(context.document);
        printHeader(`Validating ${c(C.BOLD, fileName)}`);

        try {

            initUserSchematrons(context);

            spinner.start('Loading Document');
            if (!fs.existsSync(context.document) || fs.statSync(context.document).isDirectory()) {
                spinner.fail('Loading Document Failed');
                throw new N42Error(N42ErrorCode.FILE_NOT_FOUND,
                    { details: `Document: ${c(C.BOLD, context.document)}` },
                    { retryable: false }
                );
            }
            
            const errors = await validateDocument(context);
           
            if (context.persist) {
                const valDir = getUserValidationsDir();
                const valPath = path.join(valDir, `${normalizeFilename(fileName)}_validation.json`)

                fs.writeFileSync(valPath, JSON.stringify(errors, null, 2));

                const linkValidation = `\u001B]8;;file://${valPath}\u0007View\u001B]8;;\u0007`;

                console.log();
                console.log(`  ${C.BOLD}RESULT${C.RESET}`);
                console.log(`  Found ${c(C.BOLD, errors.length)} error(s) ${c(C.BLUE, `[${linkValidation}]`)}`);
                console.log();
            } 
            else {
                console.log();
                console.log(`  ${C.BOLD}RESULT${C.RESET}`);
                console.log(`  Found ${c(C.BOLD, errors.length)} error(s)`);
                console.log(JSON.stringify(errors, null, 2));
                console.log();
            }
        }
        catch(e) {
            spinner.fail('Loading Document Failed');
            handleError(e);
        }
    });
}