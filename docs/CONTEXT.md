# N42Context Properties

| Property | Type | Description |
|---|---|---|
| command | string | CLI command name |
| subcommand | string | CLI subcommand name |
| env | string | Environment: `test` or `production` |
| runtimeEnv | object | N42Environment instance |
| document | Buffer | Path to UBL XML document |
| ubl | object | Path to UBL document descriptor |
| id | string | Unique transaction UUID |
| userId | string | Peppol participant ID of the local user |
| messageId | string | AS4 message ID |
| timestamp | string | ISO 8601 timestamp |
| certId | string | Certificate UUID |
| cert | string | Path to AP certificate PEM file |
| key | string | Path to AP private key PEM file |
| truststore | string | Path to truststore PEM file |
| keyPass | string | Private key passphrase |
| schematron | string\|array | Path to schematron validation files |
| validationErrors | array | List of validation error messages |
| senderId | string | Peppol participant ID of sender |
| receiverId | string | Peppol participant ID of receiver |
| senderCountry | string | ISO 3166-1 alpha-2 sender country code |
| receiverCountry | string | ISO 3166-1 alpha-2 receiver country code |
| documentType | string | UBL document type URN |
| processId | string | Peppol process ID URN |
| transportProfile | string | AS4 transport profile URN |
| fromPartyId | string | AS4 From PartyId |
| toPartyId | string | AS4 To PartyId |
| senderCert | string | PEM certificate of sender AP |
| senderKey | string | PEM private key of sender AP |
| receiverCert | string | PEM certificate of receiver AP |
| origReceiverCert | string | Original receiver cert before redirect |
| endpointUrl | string | Resolved AS4 endpoint URL from SMP |
| origEndpointUrl | string | Original endpoint URL before redirect |
| signalMessage | object | AS4 signal message (MDN/receipt) |
| hostname | string | Override hostname for AP endpoint |
| stripSbdh | boolean | Strip SBDH wrapper from document |
| dryrun | boolean | Dry run mode, no actual sending |
| persist | boolean | Persist transaction to storage |
| verbose | boolean | Enable verbose logging |
| timeout | number | Request timeout in milliseconds |
| spinner | object | CLI spinner instance |
| saxonAvailable | boolean | Saxon XSLT processor available |