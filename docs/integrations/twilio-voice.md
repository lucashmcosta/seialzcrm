# Twilio Voice Integration

## Overview

# Programmable Voice API Overview

Twilio's [Voice API](https://www.twilio.com/en-us/voice) helps you to make, receive, and monitor calls around the world.

Using this REST API, you can [make outbound phone calls](/docs/voice/tutorials/how-to-make-outbound-phone-calls), [modify calls in progress](/docs/voice/tutorials/how-to-modify-calls-in-progress), and [query metadata](/docs/voice/tutorials/how-to-retrieve-call-logs) about calls you've created. More advanced call features like [programmatic call control](/docs/voice/api#programmatic-call-control), creating [conference calls and call queues](/docs/voice/api), [call recordings](/docs/voice/api#record-calls), and [conversational IVRs](/docs/voice/api) are at your fingertips with Twilio's Programmable Voice.

You can also use the API to route voice calls with global reach to phones, [browsers](/docs/voice/sdks/javascript), [SIP domains](/docs/voice/api/sip-interface), and [mobile applications](/docs/voice/sdks).

> \[!NOTE]
>
> You can obtain numbers by using the [Phone Numbers API](/docs/phone-numbers)

## Base URL

The Twilio REST API is served over HTTPS. To ensure data privacy, unencrypted HTTP is not supported.

`https://api.twilio.com/2010-04-01` is the base URL for the following resources:

* [Calls resource](/docs/voice/api/call-resource)
  * [Events subresource](/docs/voice/api/call-event-resource)
  * [Calls Transcriptions subresource](/docs/voice/api/realtime-transcription-resource)
  * [Streams subresource](/docs/voice/api/stream-resource)
  * [UserDefinedMessages subresource](/docs/voice/api/userdefinedmessage-resource)
  * [UserDefinedMessageSubscription subresource](/docs/voice/api/userdefinedmessagesubscription-resource)
  * [SIPREC subresource](/docs/voice/api/siprec)
  * [Payments subresource](/docs/voice/api/payment-resource)
* [Recordings resource](/docs/voice/api/recording)
* [Transcriptions resource](/docs/voice/api/recording-transcription)
* [OutgoingCallerIds resource](/docs/voice/api/outgoing-caller-ids)
* [Conferences resource](/docs/voice/api/conference-resource)
  * [Participant subresource](/docs/voice/api/conference-participant-resource)
* [Queues resource](/docs/voice/api/queue-resource)
  * [Members subresource](/docs/voice/api/member-resource)

`https://voice.twilio.com/v1` is the base URL for the following resources:

* [Countries resource](/docs/voice/api/dialingpermissions-country-resource)
  * [HighRiskSpecialPrefixes subresource](/docs/voice/api/dialingpermissions-highriskspecialprefix-resource)
* [BulkCountryUpdates resource](/docs/voice/api/dialingpermissions-bulkcountryupdate-resource)
* [Settings resource](/docs/voice/api/dialingpermissions-settings-resource)

`https://voice.twilio.com/v2` is the base URL for the following resources:

* [Client resource](/docs/voice/api/clientconfiguration-resource)

> \[!NOTE]
>
> You can control your connectivity into Twilio's platform by including your specific [edge location](/docs/global-infrastructure/edge-locations) in the subdomain. This will allow you to bring Twilio's public or private network connectivity closer to your applications for improved performance.
>
> For instance, customers with infrastructure in Australia can make use of the `sydney` edge location by using the base URL of:
>
> ```bash
> https://api.sydney.us1.twilio.com/2010-04-01
> ```

## Voice API Authentication

To authenticate requests to the Twilio APIs, Twilio supports [HTTP Basic authentication](https://en.wikipedia.org/wiki/Basic_access_authentication). Use your *API key* as the username and your *API key secret* as the password. You can create an API key either [in the Twilio Console](/docs/iam/api-keys/keys-in-console) or [using the API](/docs/iam/api-keys/key-resource-v1).

**Note**: Twilio recommends using API keys for authentication in production apps. For local testing, you can use your Account SID as the username and your Auth token as the password. You can find your Account SID and Auth Token in the [Twilio Console](https://www.twilio.com/console).

Learn more about [Twilio API authentication](/docs/usage/requests-to-twilio).

```bash
curl -G https://api.twilio.com/2010-04-01/Accounts \
    -u $TWILIO_API_KEY:$TWILIO_API_KEY_SECRET
```

## Make and manage calls with the Voice API

Twilio's Voice API lets you make and manage calls programmatically.

To make an outbound call with the API, make a `POST` to the [Calls resource](/docs/voice/api/call-resource).

You can also leverage the REST API to query metadata and manage state for:

* [Call quality feedback](/docs/voice/api/call-resource)
* [Conferences](/docs/voice/api/conference-resource) and [Participants](/docs/voice/api/conference-participant-resource)
* [Outgoing caller IDs](/docs/voice/api/outgoing-caller-ids)
* [Queues](/docs/voice/api/queue-resource) and [Members](/docs/voice/api/member-resource)
* [Recordings](/docs/voice/api/recording) and [Transcriptions](/docs/voice/api/recording-transcription)

### Leverage the Voice SDKs to make or receive calls

Make, receive, or manage calls from any web interface or mobile application.

For step-by-step instructions on how to do this with one of our supported SDKs, check out the quickstarts for:

* [C#/.NET](/docs/voice/quickstart/server)
* [Java](/docs/voice/quickstart/server)
* [Node.js](/docs/voice/quickstart/server)
* [PHP](/docs/voice/quickstart/server)
* [Python](/docs/voice/quickstart/server)
* [Ruby](/docs/voice/quickstart/server)
* [Go](/docs/voice/quickstart/server)
* [iOS - Swift](https://github.com/twilio/voice-quickstart-swift#quickstart)
* [iOS - Objective-C](https://github.com/twilio/voice-quickstart-objc#quickstart)
* [Android](https://github.com/twilio/voice-quickstart-android#quickstart)
* [Voice JavaScript SDK](/docs/voice/sdks/javascript/get-started) (using Twilio [Functions](/docs/serverless/functions-assets/functions))

### Programmatic call control

The basics of most call flows start with the ability to say strings of text and gather DTMF keypad input.

You can use the Voice API directly to [create outbound calls](/docs/voice/api/call-resource) and query and manage state for [conferences](/docs/voice/conference), [queues](/docs/voice/api/queue-resource), and [recordings](/docs/voice/api/recording).

Twilio's markup language, [TwiML](/docs/glossary/what-is-twilio-markup-language-twiml), is the primary language used to control actions on Twilio. For instance, you'll need to use [TwiML's \<Say>](/docs/voice/twiml/say) to read some text to a person on a Twilio call.

Twilio provides SDKs in 6 supported web programming languages: [C#/.NET](https://github.com/twilio/twilio-csharp), [Java](https://github.com/twilio/twilio-java), [Node.js](https://github.com/twilio/twilio-node), [PHP](https://github.com/twilio/twilio-php), [Python](https://github.com/twilio/twilio-python), and [Ruby](https://github.com/twilio/twilio-ruby). These SDKs make including TwiML in your web application a seamless process.

For instance, you can use one of our SDKs to read some text to a caller and gather their input via keypad: [select your language of choice to get started](/docs/voice/tutorials/how-to-gather-user-input-via-keypad).

### Conference calls & Queueing

Twilio's TwiML provides intelligent [Conference](/docs/voice/conference) and [Queue](/docs/voice/twiml/queue) primitives to take the heavy lifting out of building seamless call experiences:

* Create a Conference by leveraging TwiML's [\<Dial>](/docs/voice/twiml/dial) with [\<Conference>](/docs/voice/twiml/conference). When you add a caller to a conference this way, Twilio creates a [Conference resource](/docs/voice/api/conference-resource) and a [Participant subresource](/docs/voice/api/conference-participant-resource) to represent the caller who joined.
* Use the Conference resource to list the conferences in your account, update a conference's status, and query information about participants in a given conference.
* Learn how to [create and manage conference calls from your web applications](/docs/voice/tutorials/how-to-create-conference-calls) using Twilio's SDKs.
* You can create a new Queue by making a `POST` request to the [Queues resource](/docs/voice/api/queue-resource) or by leveraging the [\<Enqueue>](/docs/voice/twiml/enqueue) verb in your TwiML document. Learn how to [use Twilio's Queue feature to create a call queueing system](/docs/voice/queue-calls).

### Record calls

With Twilio's Voice API, you can record, store, and transcribe calls with a little bit of code:

* If you're using the REST API to create your call, set [`Record=true`](/docs/voice/api/call-resource#create-a-call-resource).
* You can also generate a recording with [TwiML](/docs/voice/twiml/dial#record) or by making a `POST` request to the [Recordings resource](/docs/voice/api/recording#create-a-recording-resource) of a live call.
* Learn how to record calls made from your web application, by taking a spin through this[tutorial on recording outgoing and inbound calls with the server-side SDKs](/docs/voice/tutorials/how-to-record-phone-calls).
* Review our [support article](https://help.twilio.com/hc/en-us/articles/223133027-Transcribe-entire-phone-calls-with-Twilio) for options to transcribe your call recording.

## Manage SIP calls with Twilio's API

Route calls from your existing VoIP infrastructure to Twilio for programmatic call control - without migrating hardware or carriers with SIP interface.

[Programmable Voice SIP](/docs/voice/api/sip-interface) lets you route your voice calls with global reach to any landline phone, mobile phone, browser, mobile app, or any other SIP endpoint.

## Explore rich communications

Explore the power of Twilio's Voice API with our [quickstarts](/docs/voice/quickstart), see how to [make calls](/docs/voice/tutorials/how-to-make-outbound-phone-calls) or [respond to incoming calls](/docs/voice/tutorials/how-to-respond-to-incoming-phone-calls), [modify calls](/docs/voice/tutorials/how-to-modify-calls-in-progress), and more by diving into our [collection of tutorials for Programmable Voice](/docs/voice/tutorials).

## Get help integrating the Voice API

Twilio's Voice API is a flexible building block that can take you from making your first phone call.

While we hope this page gives a good overview of what you can do with the API, we're only scratching the surface: check out our [troubleshooting tips](/docs/voice/troubleshooting) to learn about Twilio's debugging tools, common issues, and other tools and add-ons like [Voice Insights](https://www.twilio.com/en-us/voice/insights).

If you need any help integrating the Programmable Voice API or want to talk best practices, get in touch. You can give us feedback by using the rating widget on this page, [talking to support](https://help.twilio.com), [talking to sales](https://www.twilio.com/en-us/help/sales), or [reaching out on Twitter](https://www.twitter.com/twilio).

Let's build something amazing.


## Call Resource API

# Call resource

A Call resource represents a connection between a telephone and Twilio.

Using this resource, you can initiate a call, fetch information about a completed call, fetch a list of calls made to and from your account, redirect or end a call that is in progress, and delete records of past calls from your account.

An *inbound call* occurs when a person calls one of your Twilio phone numbers, client connections, or SIP-enabled endpoints. An *outbound call* happens when you initiate a call from a Twilio phone number to an outside phone number, client, or SIP domain.

You can initiate an outbound call by sending an HTTP `POST` request to the [Calls resource](/docs/voice/api/call-resource). Calls are rate limited at the account level by Calls Per Second (CPS). Calls beyond your account's CPS limit will be queued and will execute at the CPS rate.

The `queue_time` parameter provides an estimate for how long before the call is executed. You can reduce `queue_time` by increasing the CPS value on your account.

> \[!NOTE]
>
> By default, each account is granted one CPS for calls created via `POST` requests to the `/Calls` endpoint. Inbound calls and `<Dial>` calls are not limited by CPS.
>
> Accounts with an approved [Business Profile](https://console.twilio.com/us1/account/trust-hub/customer-profiles) can update their CPS up to 30 in the Twilio Console.
>
> In aggregate, calls are executed at the rate defined by the CPS. Individual calls may not execute at the anticipated rate — you may see individual seconds with more or fewer CPS, especially for inconsistent traffic — but over a month, the call execution rate will average the CPS rate set for that account or trunk.

You can also initiate a call from an active call (e.g., forwarding to another number or dialing into a conference) by including [TwiML's \<Dial>](/docs/voice/twiml/dial) verb in your [TwiML](/docs/voice/twiml) application. However, the only way to initiate a call directly from Twilio is with an API request.

> \[!NOTE]
>
> Are you looking for step-by-step instructions for making your first call with Twilio using the SDKs? Check out [our server-side quickstart for Programmable Voice](/docs/voice/quickstart/server).

## Call Properties

```json
{"type":"object","refName":"api.v2010.account.call","modelName":"api_v2010_account_call","properties":{"sid":{"type":"string","minLength":34,"maxLength":34,"pattern":"^CA[0-9a-fA-F]{32}$","nullable":true,"description":"The unique string that we created to identify this Call resource."},"date_created":{"type":"string","format":"date-time-rfc-2822","nullable":true,"description":"The date and time in UTC that this resource was created specified in [RFC 2822](https://www.ietf.org/rfc/rfc2822.txt) format."},"date_updated":{"type":"string","format":"date-time-rfc-2822","nullable":true,"description":"The date and time in UTC that this resource was last updated, specified in [RFC 2822](https://www.ietf.org/rfc/rfc2822.txt) format."},"parent_call_sid":{"type":"string","minLength":34,"maxLength":34,"pattern":"^CA[0-9a-fA-F]{32}$","nullable":true,"description":"The SID that identifies the call that created this leg."},"account_sid":{"type":"string","minLength":34,"maxLength":34,"pattern":"^AC[0-9a-fA-F]{32}$","nullable":true,"description":"The SID of the [Account](/docs/iam/api/account) that created this Call resource."},"to":{"type":"string","nullable":true,"description":"The phone number, SIP address, Client identifier or SIM SID that received this call. Phone numbers are in [E.164](/docs/glossary/what-e164) format (e.g., +16175551212). SIP addresses are formatted as `name@company.com`. Client identifiers are formatted `client:name`. SIM SIDs are formatted as `sim:sid`.","x-twilio":{"pii":{"handling":"standard","deleteSla":120}}},"to_formatted":{"type":"string","nullable":true,"description":"The phone number, SIP address or Client identifier that received this call. Formatted for display. Non-North American phone numbers are in [E.164](/docs/glossary/what-e164) format (e.g., +442071838750).","x-twilio":{"pii":{"handling":"standard","deleteSla":120}}},"from":{"type":"string","nullable":true,"description":"The phone number, SIP address, Client identifier or SIM SID that made this call. Phone numbers are in [E.164](/docs/glossary/what-e164) format (e.g., +16175551212). SIP addresses are formatted as `name@company.com`. Client identifiers are formatted `client:name`. SIM SIDs are formatted as `sim:sid`.","x-twilio":{"pii":{"handling":"standard","deleteSla":120}}},"from_formatted":{"type":"string","nullable":true,"description":"The calling phone number, SIP address, or Client identifier formatted for display. Non-North American phone numbers are in [E.164](/docs/glossary/what-e164) format (e.g., +442071838750).","x-twilio":{"pii":{"handling":"standard","deleteSla":120}}},"phone_number_sid":{"type":"string","minLength":34,"maxLength":34,"pattern":"^PN[0-9a-fA-F]{32}$","nullable":true,"description":"If the call was inbound, this is the SID of the IncomingPhoneNumber resource that received the call. If the call was outbound, it is the SID of the OutgoingCallerId resource from which the call was placed."},"status":{"type":"string","enum":["queued","ringing","in-progress","completed","busy","failed","no-answer","canceled"],"description":"The status of this call. Can be: `queued`, `ringing`, `in-progress`, `canceled`, `completed`, `failed`, `busy` or `no-answer`. See [Call Status Values](/docs/voice/api/call-resource#call-status-values) below for more information.","refName":"call_enum_status","modelName":"call_enum_status"},"start_time":{"type":"string","format":"date-time-rfc-2822","nullable":true,"description":"The start time of the call, given as UTC in [RFC 2822](https://www.php.net/manual/en/class.datetime.php#datetime.constants.rfc2822) format. Empty if the call has not yet been dialed."},"end_time":{"type":"string","format":"date-time-rfc-2822","nullable":true,"description":"The time the call ended, given as UTC in [RFC 2822](https://www.php.net/manual/en/class.datetime.php#datetime.constants.rfc2822) format. Empty if the call did not complete successfully."},"duration":{"type":"string","nullable":true,"description":"The length of the call in seconds. This value is empty for busy, failed, unanswered, or ongoing calls."},"price":{"type":"string","nullable":true,"description":"The charge for this call, in the currency associated with the account. Populated after the call is completed. May not be immediately available. The price associated with a call only reflects the charge for connectivity.  Charges for other call-related features such as Answering Machine Detection, Text-To-Speech, and SIP REFER are not included in this value."},"price_unit":{"type":"string","format":"currency","nullable":true,"description":"The currency in which `Price` is measured, in [ISO 4127](https://www.iso.org/iso/home/standards/currency_codes.htm) format (e.g., `USD`, `EUR`, `JPY`). Always capitalized for calls."},"direction":{"type":"string","nullable":true,"description":"A string describing the direction of the call. Can be: `inbound` for inbound calls, `outbound-api` for calls initiated via the REST API or `outbound-dial` for calls initiated by a `<Dial>` verb. Using [Elastic SIP Trunking](/docs/sip-trunking), the values can be [`trunking-terminating`](/docs/sip-trunking#termination) for outgoing calls from your communications infrastructure to the PSTN or [`trunking-originating`](/docs/sip-trunking#origination) for incoming calls to your communications infrastructure from the PSTN."},"answered_by":{"type":"string","nullable":true,"description":"Either `human` or `machine` if this call was initiated with answering machine detection. Empty otherwise."},"api_version":{"type":"string","nullable":true,"description":"The API version used to create the call."},"forwarded_from":{"type":"string","nullable":true,"description":"The forwarding phone number if this call was an incoming call forwarded from another number (depends on carrier supporting forwarding). Otherwise, empty.","x-twilio":{"pii":{"handling":"standard","deleteSla":120}}},"group_sid":{"type":"string","minLength":34,"maxLength":34,"pattern":"^GP[0-9a-fA-F]{32}$","nullable":true,"description":"The Group SID associated with this call. If no Group is associated with the call, the field is empty."},"caller_name":{"type":"string","nullable":true,"description":"The caller's name if this call was an incoming call to a phone number with caller ID Lookup enabled. Otherwise, empty.","x-twilio":{"pii":{"handling":"standard","deleteSla":120}}},"queue_time":{"type":"string","nullable":true,"description":"The wait time in milliseconds before the call is placed."},"trunk_sid":{"type":"string","minLength":34,"maxLength":34,"pattern":"^TK[0-9a-fA-F]{32}$","nullable":true,"description":"The unique identifier of the trunk resource that was used for this call. The field is empty if the call was not made using a SIP trunk or if the call is not terminated."},"uri":{"type":"string","nullable":true,"description":"The URI of this resource, relative to `https://api.twilio.com`."},"subresource_uris":{"type":"object","format":"uri-map","nullable":true,"description":"A list of subresources available to this call, identified by their URIs relative to `https://api.twilio.com`."}}}
```

## Call Status values

The following are the possible values for the `Status` parameter:

| Status        | Description                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `queued`      | The call is ready and waiting in line before dialing.                                           |
| `ringing`     | The call is currently ringing.                                                                  |
| `in-progress` | The call was answered and is currently in progress.                                             |
| `canceled`    | The call was hung up while it was queued or ringing.                                            |
| `completed`   | The call was answered and has ended normally.                                                   |
| `busy`        | The caller received a busy signal.                                                              |
| `no-answer`   | There was no answer or the call was [rejected](/docs/voice/twiml/reject).                       |
| `failed`      | The call could not be completed as dialed, most likely because the provided number was invalid. |

> \[!NOTE]
>
> A completed call indicates that a connection was established, and audio data was transferred. This can occur when a call is answered by a person, an IVR phone tree menu, or even a voicemail. Completed calls, regardless of the outcome, are charged against your project balance.

## Create a Call

`POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Calls.json`

Calls can be made via the REST API to phone numbers, SIP addresses, or client identifiers. To place a new outbound call, make an `POST` request to the Calls resource.

### Path parameters

```json
[{"name":"AccountSid","in":"path","description":"The SID of the [Account](/docs/iam/api/account) that will create the resource.","schema":{"type":"string","minLength":34,"maxLength":34,"pattern":"^AC[0-9a-fA-F]{32}$"},"required":true}]
```

### Request body parameters

```json
{"schema":{"type":"object","title":"CreateCallRequest","required":["To","From"],"properties":{"To":{"type":"string","format":"endpoint","description":"The phone number, SIP address, or client identifier to call.","x-twilio":{"pii":{"handling":"standard","deleteSla":120}}},"From":{"type":"string","format":"endpoint","description":"The phone number or client identifier to use as the caller id. If using a phone number, it must be a Twilio number or a Verified [outgoing caller id](/docs/voice/api/outgoing-caller-ids) for your account. If the `to` parameter is a phone number, `From` must also be a phone number.","x-twilio":{"pii":{"handling":"standard","deleteSla":120}}},"Method":{"type":"string","format":"http-method","enum":["GET","POST"],"description":"The HTTP method we should use when calling the `url` parameter's value. Can be: `GET` or `POST` and the default is `POST`. If an `application_sid` parameter is present, this parameter is ignored."},"FallbackUrl":{"type":"string","format":"uri","description":"The URL that we call using the `fallback_method` if an error occurs when requesting or executing the TwiML at `url`. If an `application_sid` parameter is present, this parameter is ignored."},"FallbackMethod":{"type":"string","format":"http-method","enum":["GET","POST"],"description":"The HTTP method that we should use to request the `fallback_url`. Can be: `GET` or `POST` and the default is `POST`. If an `application_sid` parameter is present, this parameter is ignored."},"StatusCallback":{"type":"string","format":"uri","description":"The URL we should call using the `status_callback_method` to send status information to your application. If no `status_callback_event` is specified, we will send the `completed` status. If an `application_sid` parameter is present, this parameter is ignored. URLs must contain a valid hostname (underscores are not permitted)."},"StatusCallbackEvent":{"type":"array","description":"The call progress events that we will send to the `status_callback` URL. Can be: `initiated`, `ringing`, `answered`, and `completed`. If no event is specified, we send the `completed` status. If you want to receive multiple events, specify each one in a separate `status_callback_event` parameter. See the code sample for [monitoring call progress](/docs/voice/api/call-resource?code-sample=code-create-a-call-resource-and-specify-a-statuscallbackevent&code-sdk-version=json). If an `application_sid` is present, this parameter is ignored.","items":{"type":"string"}},"StatusCallbackMethod":{"type":"string","format":"http-method","enum":["GET","POST"],"description":"The HTTP method we should use when calling the `status_callback` URL. Can be: `GET` or `POST` and the default is `POST`. If an `application_sid` parameter is present, this parameter is ignored."},"SendDigits":{"type":"string","description":"The string of keys to dial after connecting to the number, with a maximum length of 32 digits. Valid digits in the string include any digit (`0`-`9`), '`A`', '`B`', '`C`', '`D`', '`#`', and '`*`'. You can also use '`w`' to insert a half-second pause and '`W`' to insert a one-second pause. For example, to pause for one second after connecting and then dial extension 1234 followed by the # key, set this parameter to `W1234#`. Be sure to URL-encode this string because the '`#`' character has special meaning in a URL. If both `SendDigits` and `MachineDetection` parameters are provided, then `MachineDetection` will be ignored."},"Timeout":{"type":"integer","description":"The integer number of seconds that we should allow the phone to ring before assuming there is no answer. The default is `60` seconds and the maximum is `600` seconds. For some call flows, we will add a 5-second buffer to the timeout value you provide. For this reason, a timeout value of 10 seconds could result in an actual timeout closer to 15 seconds. You can set this to a short time, such as `15` seconds, to hang up before reaching an answering machine or voicemail."},"Record":{"type":"boolean","description":"Whether to record the call. Can be `true` to record the phone call, or `false` to not. The default is `false`. The `recording_url` is sent to the `status_callback` URL."},"RecordingChannels":{"type":"string","description":"The number of channels in the final recording. Can be: `mono` or `dual`. The default is `mono`. `mono` records both legs of the call in a single channel of the recording file. `dual` records each leg to a separate channel of the recording file. The first channel of a dual-channel recording contains the parent call and the second channel contains the child call."},"RecordingStatusCallback":{"type":"string","description":"The URL that we call when the recording is available to be accessed."},"RecordingStatusCallbackMethod":{"type":"string","format":"http-method","enum":["GET","POST"],"description":"The HTTP method we should use when calling the `recording_status_callback` URL. Can be: `GET` or `POST` and the default is `POST`."},"SipAuthUsername":{"type":"string","description":"The username used to authenticate the caller making a SIP call."},"SipAuthPassword":{"type":"string","description":"The password required to authenticate the user account specified in `sip_auth_username`."},"MachineDetection":{"type":"string","description":"Whether to detect if a human, answering machine, or fax has picked up the call. Can be: `Enable` or `DetectMessageEnd`. Use `Enable` if you would like us to return `AnsweredBy` as soon as the called party is identified. Use `DetectMessageEnd`, if you would like to leave a message on an answering machine. If `send_digits` is provided, this parameter is ignored. For more information, see [Answering Machine Detection](/docs/voice/answering-machine-detection)."},"MachineDetectionTimeout":{"type":"integer","description":"The number of seconds that we should attempt to detect an answering machine before timing out and sending a voice request with `AnsweredBy` of `unknown`. The default timeout is 30 seconds."},"RecordingStatusCallbackEvent":{"type":"array","description":"The recording status events that will trigger calls to the URL specified in `recording_status_callback`. Can be: `in-progress`, `completed` and `absent`. Defaults to `completed`. Separate  multiple values with a space.","items":{"type":"string"}},"Trim":{"type":"string","description":"Whether to trim any leading and trailing silence from the recording. Can be: `trim-silence` or `do-not-trim` and the default is `trim-silence`."},"CallerId":{"type":"string","description":"The phone number, SIP address, or Client identifier that made this call. Phone numbers are in [E.164 format](https://wwnw.twilio.com/docs/glossary/what-e164) (e.g., +16175551212). SIP addresses are formatted as `name@company.com`."},"MachineDetectionSpeechThreshold":{"type":"integer","description":"The number of milliseconds that is used as the measuring stick for the length of the speech activity, where durations lower than this value will be interpreted as a human and longer than this value as a machine. Possible Values: 1000-6000. Default: 2400."},"MachineDetectionSpeechEndThreshold":{"type":"integer","description":"The number of milliseconds of silence after speech activity at which point the speech activity is considered complete. Possible Values: 500-5000. Default: 1200."},"MachineDetectionSilenceTimeout":{"type":"integer","description":"The number of milliseconds of initial silence after which an `unknown` AnsweredBy result will be returned. Possible Values: 2000-10000. Default: 5000."},"AsyncAmd":{"type":"string","description":"Select whether to perform answering machine detection in the background. Default, blocks the execution of the call until Answering Machine Detection is completed. Can be: `true` or `false`."},"AsyncAmdStatusCallback":{"type":"string","format":"uri","description":"The URL that we should call using the `async_amd_status_callback_method` to notify customer application whether the call was answered by human, machine or fax."},"AsyncAmdStatusCallbackMethod":{"type":"string","format":"http-method","enum":["GET","POST"],"description":"The HTTP method we should use when calling the `async_amd_status_callback` URL. Can be: `GET` or `POST` and the default is `POST`."},"Byoc":{"type":"string","minLength":34,"maxLength":34,"pattern":"^BY[0-9a-fA-F]{32}$","description":"The SID of a BYOC (Bring Your Own Carrier) trunk to route this call with. Note that `byoc` is only meaningful when `to` is a phone number; it will otherwise be ignored. (Beta)"},"CallReason":{"type":"string","description":"The Reason for the outgoing call. Use it to specify the purpose of the call that is presented on the called party's phone. (Branded Calls Beta)"},"CallToken":{"type":"string","description":"A token string needed to invoke a forwarded call. A call_token is generated when an incoming call is received on a Twilio number. Pass an incoming call's call_token value to a forwarded call via the call_token parameter when creating a new call. A forwarded call should bear the same CallerID of the original incoming call."},"RecordingTrack":{"type":"string","description":"The audio track to record for the call. Can be: `inbound`, `outbound` or `both`. The default is `both`. `inbound` records the audio that is received by Twilio. `outbound` records the audio that is generated from Twilio. `both` records the audio that is received and generated by Twilio."},"TimeLimit":{"type":"integer","description":"The maximum duration of the call in seconds. Constraints depend on account and configuration."},"Url":{"type":"string","format":"uri","description":"The absolute URL that returns the TwiML instructions for the call. We will call this URL using the `method` when the call connects. For more information, see the [Url Parameter](/docs/voice/make-calls#specify-a-url-parameter) section in [Making Calls](/docs/voice/make-calls)."},"Twiml":{"type":"string","format":"twiml","description":"TwiML instructions for the call Twilio will use without fetching Twiml from url parameter. If both `twiml` and `url` are provided then `twiml` parameter will be ignored. Max 4000 characters."},"ApplicationSid":{"type":"string","minLength":34,"maxLength":34,"pattern":"^AP[0-9a-fA-F]{32}$","description":"The SID of the Application resource that will handle the call, if the call will be handled by an application."}}},"examples":{"create":{"value":{"lang":"json","value":"{\n  \"ApplicationSid\": \"APaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\n  \"FallbackMethod\": \"GET\",\n  \"FallbackUrl\": \"https://example.com\",\n  \"From\": \"+987654321\",\n  \"IfMachine\": \"if_machine\",\n  \"MachineDetection\": \"enable\",\n  \"MachineDetectionTimeout\": 15,\n  \"Method\": \"GET\",\n  \"Record\": \"true\",\n  \"RecordingTrack\": \"both\",\n  \"Trim\": \"do-not-trim\",\n  \"SendDigits\": \"send_digits\",\n  \"StatusCallback\": \"https://example.com\",\n  \"StatusCallbackMethod\": \"GET\",\n  \"Timeout\": 1,\n  \"To\": \"+123456789\",\n  \"Url\": \"https://example.com\",\n  \"CallerId\": \"Caller\",\n  \"MachineDetectionSpeechThreshold\": 3000,\n  \"MachineDetectionSpeechEndThreshold\": 3000,\n  \"MachineDetectionSilenceTimeout\": 3000,\n  \"AsyncAmd\": \"true\",\n  \"AsyncAmdStatusCallback\": \"http://statuscallback.com\",\n  \"AsyncAmdStatusCallbackMethod\": \"POST\",\n  \"MachineDetectionEngine\": \"Lumenvox\",\n  \"MachineDetectionMinWordLength\": 100,\n  \"MachineDetectionMaxWordLength\": 5000,\n  \"MachineDetectionWordsSilence\": 50,\n  \"MachineDetectionMaxNumOfWords\": 5,\n  \"MachineDetectionSilenceThreshold\": 256,\n  \"Byoc\": \"BYaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\n  \"CallReason\": \"Reason for the call (Beta)\",\n  \"TimeLimit\": 3600,\n  \"CallToken\": \"call-token-string\",\n  \"Transcribe\": \"true\",\n  \"TranscriptionConfiguration\": \"JVaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\n  \"ClientNotificationUrl\": \"https://clientnotification.com\"\n}","meta":"","code":"{\n  \"ApplicationSid\": \"APaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\n  \"FallbackMethod\": \"GET\",\n  \"FallbackUrl\": \"https://example.com\",\n  \"From\": \"+987654321\",\n  \"IfMachine\": \"if_machine\",\n  \"MachineDetection\": \"enable\",\n  \"MachineDetectionTimeout\": 15,\n  \"Method\": \"GET\",\n  \"Record\": \"true\",\n  \"RecordingTrack\": \"both\",\n  \"Trim\": \"do-not-trim\",\n  \"SendDigits\": \"send_digits\",\n  \"StatusCallback\": \"https://example.com\",\n  \"StatusCallbackMethod\": \"GET\",\n  \"Timeout\": 1,\n  \"To\": \"+123456789\",\n  \"Url\": \"https://example.com\",\n  \"CallerId\": \"Caller\",\n  \"MachineDetectionSpeechThreshold\": 3000,\n  \"MachineDetectionSpeechEndThreshold\": 3000,\n  \"MachineDetectionSilenceTimeout\": 3000,\n  \"AsyncAmd\": \"true\",\n  \"AsyncAmdStatusCallback\": \"http://statuscallback.com\",\n  \"AsyncAmdStatusCallbackMethod\": \"POST\",\n  \"MachineDetectionEngine\": \"Lumenvox\",\n  \"MachineDetectionMinWordLength\": 100,\n  \"MachineDetectionMaxWordLength\": 5000,\n  \"MachineDetectionWordsSilence\": 50,\n  \"MachineDetectionMaxNumOfWords\": 5,\n  \"MachineDetectionSilenceThreshold\": 256,\n  \"Byoc\": \"BYaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\n  \"CallReason\": \"Reason for the call (Beta)\",\n  \"TimeLimit\": 3600,\n  \"CallToken\": \"call-token-string\",\n  \"Transcribe\": \"true\",\n  \"TranscriptionConfiguration\": \"JVaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\n  \"ClientNotificationUrl\": \"https://clientnotification.com\"\n}","tokens":[["{","#C9D1D9"],"\n  ",["\"ApplicationSid\"","#7EE787"],[":","#C9D1D9"]," ",["\"APaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"FallbackMethod\"","#7EE787"],[":","#C9D1D9"]," ",["\"GET\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"FallbackUrl\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://example.com\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"From\"","#7EE787"],[":","#C9D1D9"]," ",["\"+987654321\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"IfMachine\"","#7EE787"],[":","#C9D1D9"]," ",["\"if_machine\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetection\"","#7EE787"],[":","#C9D1D9"]," ",["\"enable\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetectionTimeout\"","#7EE787"],[":","#C9D1D9"]," ",["15","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"Method\"","#7EE787"],[":","#C9D1D9"]," ",["\"GET\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Record\"","#7EE787"],[":","#C9D1D9"]," ",["\"true\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"RecordingTrack\"","#7EE787"],[":","#C9D1D9"]," ",["\"both\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Trim\"","#7EE787"],[":","#C9D1D9"]," ",["\"do-not-trim\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"SendDigits\"","#7EE787"],[":","#C9D1D9"]," ",["\"send_digits\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"StatusCallback\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://example.com\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"StatusCallbackMethod\"","#7EE787"],[":","#C9D1D9"]," ",["\"GET\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Timeout\"","#7EE787"],[":","#C9D1D9"]," ",["1","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"To\"","#7EE787"],[":","#C9D1D9"]," ",["\"+123456789\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Url\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://example.com\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"CallerId\"","#7EE787"],[":","#C9D1D9"]," ",["\"Caller\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetectionSpeechThreshold\"","#7EE787"],[":","#C9D1D9"]," ",["3000","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetectionSpeechEndThreshold\"","#7EE787"],[":","#C9D1D9"]," ",["3000","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetectionSilenceTimeout\"","#7EE787"],[":","#C9D1D9"]," ",["3000","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"AsyncAmd\"","#7EE787"],[":","#C9D1D9"]," ",["\"true\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"AsyncAmdStatusCallback\"","#7EE787"],[":","#C9D1D9"]," ",["\"http://statuscallback.com\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"AsyncAmdStatusCallbackMethod\"","#7EE787"],[":","#C9D1D9"]," ",["\"POST\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetectionEngine\"","#7EE787"],[":","#C9D1D9"]," ",["\"Lumenvox\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetectionMinWordLength\"","#7EE787"],[":","#C9D1D9"]," ",["100","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetectionMaxWordLength\"","#7EE787"],[":","#C9D1D9"]," ",["5000","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetectionWordsSilence\"","#7EE787"],[":","#C9D1D9"]," ",["50","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetectionMaxNumOfWords\"","#7EE787"],[":","#C9D1D9"]," ",["5","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetectionSilenceThreshold\"","#7EE787"],[":","#C9D1D9"]," ",["256","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"Byoc\"","#7EE787"],[":","#C9D1D9"]," ",["\"BYaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"CallReason\"","#7EE787"],[":","#C9D1D9"]," ",["\"Reason for the call (Beta)\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"TimeLimit\"","#7EE787"],[":","#C9D1D9"]," ",["3600","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"CallToken\"","#7EE787"],[":","#C9D1D9"]," ",["\"call-token-string\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Transcribe\"","#7EE787"],[":","#C9D1D9"]," ",["\"true\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"TranscriptionConfiguration\"","#7EE787"],[":","#C9D1D9"]," ",["\"JVaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"ClientNotificationUrl\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://clientnotification.com\"","#A5D6FF"],"\n",["}","#C9D1D9"]],"annotations":[],"themeName":"github-dark","style":{"color":"#c9d1d9","background":"#0d1117"}}},"createWithTwiml":{"value":{"lang":"json","value":"{\n  \"ApplicationSid\": \"APaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\n  \"FallbackMethod\": \"GET\",\n  \"FallbackUrl\": \"https://example.com\",\n  \"From\": \"+987654321\",\n  \"IfMachine\": \"if_machine\",\n  \"MachineDetection\": \"enable\",\n  \"MachineDetectionTimeout\": 15,\n  \"Method\": \"\",\n  \"Record\": \"true\",\n  \"Trim\": \"do-not-trim\",\n  \"SendDigits\": \"send_digits\",\n  \"StatusCallback\": \"https://example.com\",\n  \"StatusCallbackMethod\": \"GET\",\n  \"Timeout\": 1,\n  \"To\": \"+123456789\",\n  \"Url\": \"\",\n  \"CallerId\": \"Caller\",\n  \"MachineDetectionSpeechThreshold\": 3000,\n  \"MachineDetectionSpeechEndThreshold\": 3000,\n  \"MachineDetectionSilenceTimeout\": 3000,\n  \"Twiml\": \"<Response><Say>Enjoy</Say></Response>\",\n  \"CallReason\": \"Reason for the call (Beta)\",\n  \"TimeLimit\": 3600,\n  \"CallToken\": \"call-token-string\",\n  \"Transcribe\": \"true\",\n  \"TranscriptionConfiguration\": \"JVaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\n  \"ClientNotificationUrl\": \"https://clientnotification.com\"\n}","meta":"","code":"{\n  \"ApplicationSid\": \"APaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\n  \"FallbackMethod\": \"GET\",\n  \"FallbackUrl\": \"https://example.com\",\n  \"From\": \"+987654321\",\n  \"IfMachine\": \"if_machine\",\n  \"MachineDetection\": \"enable\",\n  \"MachineDetectionTimeout\": 15,\n  \"Method\": \"\",\n  \"Record\": \"true\",\n  \"Trim\": \"do-not-trim\",\n  \"SendDigits\": \"send_digits\",\n  \"StatusCallback\": \"https://example.com\",\n  \"StatusCallbackMethod\": \"GET\",\n  \"Timeout\": 1,\n  \"To\": \"+123456789\",\n  \"Url\": \"\",\n  \"CallerId\": \"Caller\",\n  \"MachineDetectionSpeechThreshold\": 3000,\n  \"MachineDetectionSpeechEndThreshold\": 3000,\n  \"MachineDetectionSilenceTimeout\": 3000,\n  \"Twiml\": \"<Response><Say>Enjoy</Say></Response>\",\n  \"CallReason\": \"Reason for the call (Beta)\",\n  \"TimeLimit\": 3600,\n  \"CallToken\": \"call-token-string\",\n  \"Transcribe\": \"true\",\n  \"TranscriptionConfiguration\": \"JVaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\n  \"ClientNotificationUrl\": \"https://clientnotification.com\"\n}","tokens":[["{","#C9D1D9"],"\n  ",["\"ApplicationSid\"","#7EE787"],[":","#C9D1D9"]," ",["\"APaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"FallbackMethod\"","#7EE787"],[":","#C9D1D9"]," ",["\"GET\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"FallbackUrl\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://example.com\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"From\"","#7EE787"],[":","#C9D1D9"]," ",["\"+987654321\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"IfMachine\"","#7EE787"],[":","#C9D1D9"]," ",["\"if_machine\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetection\"","#7EE787"],[":","#C9D1D9"]," ",["\"enable\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetectionTimeout\"","#7EE787"],[":","#C9D1D9"]," ",["15","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"Method\"","#7EE787"],[":","#C9D1D9"]," ",["\"\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Record\"","#7EE787"],[":","#C9D1D9"]," ",["\"true\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Trim\"","#7EE787"],[":","#C9D1D9"]," ",["\"do-not-trim\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"SendDigits\"","#7EE787"],[":","#C9D1D9"]," ",["\"send_digits\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"StatusCallback\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://example.com\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"StatusCallbackMethod\"","#7EE787"],[":","#C9D1D9"]," ",["\"GET\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Timeout\"","#7EE787"],[":","#C9D1D9"]," ",["1","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"To\"","#7EE787"],[":","#C9D1D9"]," ",["\"+123456789\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Url\"","#7EE787"],[":","#C9D1D9"]," ",["\"\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"CallerId\"","#7EE787"],[":","#C9D1D9"]," ",["\"Caller\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetectionSpeechThreshold\"","#7EE787"],[":","#C9D1D9"]," ",["3000","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetectionSpeechEndThreshold\"","#7EE787"],[":","#C9D1D9"]," ",["3000","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"MachineDetectionSilenceTimeout\"","#7EE787"],[":","#C9D1D9"]," ",["3000","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"Twiml\"","#7EE787"],[":","#C9D1D9"]," ",["\"<Response><Say>Enjoy</Say></Response>\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"CallReason\"","#7EE787"],[":","#C9D1D9"]," ",["\"Reason for the call (Beta)\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"TimeLimit\"","#7EE787"],[":","#C9D1D9"]," ",["3600","#79C0FF"],[",","#C9D1D9"],"\n  ",["\"CallToken\"","#7EE787"],[":","#C9D1D9"]," ",["\"call-token-string\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Transcribe\"","#7EE787"],[":","#C9D1D9"]," ",["\"true\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"TranscriptionConfiguration\"","#7EE787"],[":","#C9D1D9"]," ",["\"JVaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"ClientNotificationUrl\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://clientnotification.com\"","#A5D6FF"],"\n",["}","#C9D1D9"]],"annotations":[],"themeName":"github-dark","style":{"color":"#c9d1d9","background":"#0d1117"}}}},"encodingType":"application/x-www-form-urlencoded","conditionalParameterMap":{"Url":["Twiml","ApplicationSid"],"Twiml":["Url","ApplicationSid"],"ApplicationSid":["Url","Twiml"]}}
```

> \[!WARNING]
>
> The use of the record attribute is subject to the same obligations and requirements as the [Recordings resource](/docs/voice/api/recording) and the [`<Record>` TwiML verb](/docs/voice/twiml/record). For workflows subject to [PCI](/docs/voice/pci-workflows) or the Health Insurance Portability and the Accountability Act (HIPAA), see the applicable documentation.

Create a Call with TwiML

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function createCall() {
  const call = await client.calls.create({
    from: "+15552223214",
    to: "+15558675310",
    twiml: "<Response><Say>Ahoy there!</Say></Response>",
  });

  console.log(call.sid);
}

createCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

call = client.calls.create(
    twiml="<Response><Say>Ahoy there!</Say></Response>",
    to="+15558675310",
    from_="+15552223214",
)

print(call.sid)
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        var call = await CallResource.CreateAsync(
            twiml: new Twilio.Types.Twiml("<Response><Say>Ahoy there!</Say></Response>"),
            to: new Twilio.Types.PhoneNumber("+15558675310"),
            from: new Twilio.Types.PhoneNumber("+15552223214"));

        Console.WriteLine(call.Sid);
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import com.twilio.type.Twiml;
import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        Call call = Call.creator(new com.twilio.type.PhoneNumber("+15558675310"),
                            new com.twilio.type.PhoneNumber("+15552223214"),
                            new com.twilio.type.Twiml("<Response><Say>Ahoy there!</Say></Response>"))
                        .create();

        System.out.println(call.getSid());
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.CreateCallParams{}
	params.SetTwiml("<Response><Say>Ahoy there!</Say></Response>")
	params.SetTo("+15558675310")
	params.SetFrom("+15552223214")

	resp, err := client.Api.CreateCall(params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	} else {
		if resp.Sid != nil {
			fmt.Println(*resp.Sid)
		} else {
			fmt.Println(resp.Sid)
		}
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$call = $twilio->calls->create(
    "+15558675310", // To
    "+15552223214", // From
    ["twiml" => "<Response><Say>Ahoy there!</Say></Response>"]
);

print $call->sid;
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

call = @client
       .api
       .v2010
       .calls
       .create(
         twiml: '<Response><Say>Ahoy there!</Say></Response>',
         to: '+15558675310',
         from: '+15552223214'
       )

puts call.sid
```

```bash
EXCLAMATION_MARK='!'
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:create \
   --twiml "<Response><Say>Ahoy there$EXCLAMATION_MARK</Say></Response>" \
   --to +15558675310 \
   --from +15552223214
```

```bash
EXCLAMATION_MARK='!'
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls.json" \
--data-urlencode "Twiml=<Response><Say>Ahoy there$EXCLAMATION_MARK</Say></Response>" \
--data-urlencode "To=+15558675310" \
--data-urlencode "From=+15552223214" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

```json
{
  "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "answered_by": null,
  "api_version": "2010-04-01",
  "caller_name": null,
  "date_created": "Tue, 31 Aug 2010 20:36:28 +0000",
  "date_updated": "Tue, 31 Aug 2010 20:36:44 +0000",
  "direction": "inbound",
  "duration": "15",
  "end_time": "Tue, 31 Aug 2010 20:36:44 +0000",
  "forwarded_from": "+141586753093",
  "from": "+15552223214",
  "from_formatted": "(415) 867-5308",
  "group_sid": null,
  "parent_call_sid": null,
  "phone_number_sid": "PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "price": "-0.03000",
  "price_unit": "USD",
  "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "start_time": "Tue, 31 Aug 2010 20:36:29 +0000",
  "status": "completed",
  "subresource_uris": {
    "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
    "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
    "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
    "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
    "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
    "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
    "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
    "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
    "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json",
    "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/TwimlSessions.json"
  },
  "to": "+15558675310",
  "to_formatted": "(415) 867-5309",
  "trunk_sid": null,
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
  "queue_time": "1000"
}
```

Create a Call with a URL

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function createCall() {
  const call = await client.calls.create({
    from: "+15017122661",
    to: "+15558675310",
    url: "http://demo.twilio.com/docs/voice.xml",
  });

  console.log(call.sid);
}

createCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

call = client.calls.create(
    url="http://demo.twilio.com/docs/voice.xml",
    to="+15558675310",
    from_="+15017122661",
)

print(call.sid)
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        var call = await CallResource.CreateAsync(
            url: new Uri("http://demo.twilio.com/docs/voice.xml"),
            to: new Twilio.Types.PhoneNumber("+15558675310"),
            from: new Twilio.Types.PhoneNumber("+15017122661"));

        Console.WriteLine(call.Sid);
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import java.net.URI;
import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        Call call = Call.creator(new com.twilio.type.PhoneNumber("+15558675310"),
                            new com.twilio.type.PhoneNumber("+15017122661"),
                            URI.create("http://demo.twilio.com/docs/voice.xml"))
                        .create();

        System.out.println(call.getSid());
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.CreateCallParams{}
	params.SetUrl("http://demo.twilio.com/docs/voice.xml")
	params.SetTo("+15558675310")
	params.SetFrom("+15017122661")

	resp, err := client.Api.CreateCall(params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	} else {
		if resp.Sid != nil {
			fmt.Println(*resp.Sid)
		} else {
			fmt.Println(resp.Sid)
		}
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$call = $twilio->calls->create(
    "+15558675310", // To
    "+15017122661", // From
    ["url" => "http://demo.twilio.com/docs/voice.xml"]
);

print $call->sid;
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

call = @client
       .api
       .v2010
       .calls
       .create(
         url: 'http://demo.twilio.com/docs/voice.xml',
         to: '+15558675310',
         from: '+15017122661'
       )

puts call.sid
```

```bash
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:create \
   --url http://demo.twilio.com/docs/voice.xml \
   --to +15558675310 \
   --from +15017122661
```

```bash
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls.json" \
--data-urlencode "Url=http://demo.twilio.com/docs/voice.xml" \
--data-urlencode "To=+15558675310" \
--data-urlencode "From=+15017122661" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

```json
{
  "account_sid": "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "answered_by": null,
  "api_version": "2010-04-01",
  "caller_name": null,
  "date_created": "Tue, 31 Aug 2010 20:36:28 +0000",
  "date_updated": "Tue, 31 Aug 2010 20:36:44 +0000",
  "direction": "inbound",
  "duration": "15",
  "end_time": "Tue, 31 Aug 2010 20:36:44 +0000",
  "forwarded_from": "+141586753093",
  "from": "+15017122661",
  "from_formatted": "(415) 867-5308",
  "group_sid": null,
  "parent_call_sid": null,
  "phone_number_sid": "PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "price": "-0.03000",
  "price_unit": "USD",
  "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "start_time": "Tue, 31 Aug 2010 20:36:29 +0000",
  "status": "completed",
  "subresource_uris": {
    "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
    "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
    "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
    "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
    "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
    "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
    "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
    "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
    "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json",
    "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/TwimlSessions.json"
  },
  "to": "+15558675310",
  "to_formatted": "(415) 867-5309",
  "trunk_sid": null,
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
  "queue_time": "1000"
}
```

Create a Call and specify a StatusCallback URL

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function createCall() {
  const call = await client.calls.create({
    from: "+18668675310",
    method: "GET",
    statusCallback: "https://www.myapp.com/events",
    statusCallbackMethod: "POST",
    to: "+14155551212",
    url: "http://demo.twilio.com/docs/voice.xml",
  });

  console.log(call.sid);
}

createCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

call = client.calls.create(
    method="GET",
    status_callback="https://www.myapp.com/events",
    status_callback_method="POST",
    url="http://demo.twilio.com/docs/voice.xml",
    to="+14155551212",
    from_="+18668675310",
)

print(call.sid)
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        var call = await CallResource.CreateAsync(
            method: Twilio.Http.HttpMethod.Get,
            statusCallback: new Uri("https://www.myapp.com/events"),
            statusCallbackMethod: Twilio.Http.HttpMethod.Post,
            url: new Uri("http://demo.twilio.com/docs/voice.xml"),
            to: new Twilio.Types.PhoneNumber("+14155551212"),
            from: new Twilio.Types.PhoneNumber("+18668675310"));

        Console.WriteLine(call.Sid);
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import java.net.URI;
import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;
import com.twilio.http.HttpMethod;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        Call call = Call.creator(new com.twilio.type.PhoneNumber("+14155551212"),
                            new com.twilio.type.PhoneNumber("+18668675310"),
                            URI.create("http://demo.twilio.com/docs/voice.xml"))
                        .setMethod(HttpMethod.GET)
                        .setStatusCallback(URI.create("https://www.myapp.com/events"))
                        .setStatusCallbackMethod(HttpMethod.POST)
                        .create();

        System.out.println(call.getSid());
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.CreateCallParams{}
	params.SetMethod("GET")
	params.SetStatusCallback("https://www.myapp.com/events")
	params.SetStatusCallbackMethod("POST")
	params.SetUrl("http://demo.twilio.com/docs/voice.xml")
	params.SetTo("+14155551212")
	params.SetFrom("+18668675310")

	resp, err := client.Api.CreateCall(params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	} else {
		if resp.Sid != nil {
			fmt.Println(*resp.Sid)
		} else {
			fmt.Println(resp.Sid)
		}
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$call = $twilio->calls->create(
    "+14155551212", // To
    "+18668675310", // From
    [
        "method" => "GET",
        "statusCallback" => "https://www.myapp.com/events",
        "statusCallbackMethod" => "POST",
        "url" => "http://demo.twilio.com/docs/voice.xml",
    ]
);

print $call->sid;
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

call = @client
       .api
       .v2010
       .calls
       .create(
         method: 'GET',
         status_callback: 'https://www.myapp.com/events',
         status_callback_method: 'POST',
         url: 'http://demo.twilio.com/docs/voice.xml',
         to: '+14155551212',
         from: '+18668675310'
       )

puts call.sid
```

```bash
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:create \
   --method GET \
   --status-callback https://www.myapp.com/events \
   --status-callback-method POST \
   --url http://demo.twilio.com/docs/voice.xml \
   --to +14155551212 \
   --from +18668675310
```

```bash
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls.json" \
--data-urlencode "Method=GET" \
--data-urlencode "StatusCallback=https://www.myapp.com/events" \
--data-urlencode "StatusCallbackMethod=POST" \
--data-urlencode "Url=http://demo.twilio.com/docs/voice.xml" \
--data-urlencode "To=+14155551212" \
--data-urlencode "From=+18668675310" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

```json
{
  "account_sid": "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "answered_by": null,
  "api_version": "2010-04-01",
  "caller_name": null,
  "date_created": "Tue, 31 Aug 2010 20:36:28 +0000",
  "date_updated": "Tue, 31 Aug 2010 20:36:44 +0000",
  "direction": "inbound",
  "duration": "15",
  "end_time": "Tue, 31 Aug 2010 20:36:44 +0000",
  "forwarded_from": "+141586753093",
  "from": "+18668675310",
  "from_formatted": "(415) 867-5308",
  "group_sid": null,
  "parent_call_sid": null,
  "phone_number_sid": "PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "price": "-0.03000",
  "price_unit": "USD",
  "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "start_time": "Tue, 31 Aug 2010 20:36:29 +0000",
  "status": "completed",
  "subresource_uris": {
    "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
    "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
    "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
    "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
    "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
    "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
    "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
    "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
    "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json",
    "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/TwimlSessions.json"
  },
  "to": "+14155551212",
  "to_formatted": "(415) 867-5309",
  "trunk_sid": null,
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
  "queue_time": "1000"
}
```

Create a Call and specify a StatusCallbackEvent

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function createCall() {
  const call = await client.calls.create({
    from: "+18668675310",
    method: "GET",
    statusCallback: "https://www.myapp.com/events",
    statusCallbackEvent: ["initiated", "answered"],
    statusCallbackMethod: "POST",
    to: "+14155551212",
    url: "http://demo.twilio.com/docs/voice.xml",
  });

  console.log(call.sid);
}

createCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

call = client.calls.create(
    method="GET",
    status_callback="https://www.myapp.com/events",
    status_callback_event=["initiated", "answered"],
    status_callback_method="POST",
    url="http://demo.twilio.com/docs/voice.xml",
    to="+14155551212",
    from_="+18668675310",
)

print(call.sid)
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;
using System.Collections.Generic;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        var call = await CallResource.CreateAsync(
            method: Twilio.Http.HttpMethod.Get,
            statusCallback: new Uri("https://www.myapp.com/events"),
            statusCallbackEvent: new List<string> { "initiated", "answered" },
            statusCallbackMethod: Twilio.Http.HttpMethod.Post,
            url: new Uri("http://demo.twilio.com/docs/voice.xml"),
            to: new Twilio.Types.PhoneNumber("+14155551212"),
            from: new Twilio.Types.PhoneNumber("+18668675310"));

        Console.WriteLine(call.Sid);
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import java.net.URI;
import java.util.Arrays;
import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;
import com.twilio.http.HttpMethod;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        Call call = Call.creator(new com.twilio.type.PhoneNumber("+14155551212"),
                            new com.twilio.type.PhoneNumber("+18668675310"),
                            URI.create("http://demo.twilio.com/docs/voice.xml"))
                        .setMethod(HttpMethod.GET)
                        .setStatusCallback(URI.create("https://www.myapp.com/events"))
                        .setStatusCallbackEvent(Arrays.asList("initiated", "answered"))
                        .setStatusCallbackMethod(HttpMethod.POST)
                        .create();

        System.out.println(call.getSid());
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.CreateCallParams{}
	params.SetMethod("GET")
	params.SetStatusCallback("https://www.myapp.com/events")
	params.SetStatusCallbackEvent([]string{
		"initiated",
		"answered",
	})
	params.SetStatusCallbackMethod("POST")
	params.SetUrl("http://demo.twilio.com/docs/voice.xml")
	params.SetTo("+14155551212")
	params.SetFrom("+18668675310")

	resp, err := client.Api.CreateCall(params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	} else {
		if resp.Sid != nil {
			fmt.Println(*resp.Sid)
		} else {
			fmt.Println(resp.Sid)
		}
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$call = $twilio->calls->create(
    "+14155551212", // To
    "+18668675310", // From
    [
        "method" => "GET",
        "statusCallback" => "https://www.myapp.com/events",
        "statusCallbackEvent" => ["initiated", "answered"],
        "statusCallbackMethod" => "POST",
        "url" => "http://demo.twilio.com/docs/voice.xml",
    ]
);

print $call->sid;
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

call = @client
       .api
       .v2010
       .calls
       .create(
         method: 'GET',
         status_callback: 'https://www.myapp.com/events',
         status_callback_event: [
           'initiated',
           'answered'
         ],
         status_callback_method: 'POST',
         url: 'http://demo.twilio.com/docs/voice.xml',
         to: '+14155551212',
         from: '+18668675310'
       )

puts call.sid
```

```bash
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:create \
   --method GET \
   --status-callback https://www.myapp.com/events \
   --status-callback-event initiated answered \
   --status-callback-method POST \
   --url http://demo.twilio.com/docs/voice.xml \
   --to +14155551212 \
   --from +18668675310
```

```bash
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls.json" \
--data-urlencode "Method=GET" \
--data-urlencode "StatusCallback=https://www.myapp.com/events" \
--data-urlencode "StatusCallbackEvent=initiated" \
--data-urlencode "StatusCallbackEvent=answered" \
--data-urlencode "StatusCallbackMethod=POST" \
--data-urlencode "Url=http://demo.twilio.com/docs/voice.xml" \
--data-urlencode "To=+14155551212" \
--data-urlencode "From=+18668675310" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

```json
{
  "account_sid": "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "answered_by": null,
  "api_version": "2010-04-01",
  "caller_name": null,
  "date_created": "Tue, 31 Aug 2010 20:36:28 +0000",
  "date_updated": "Tue, 31 Aug 2010 20:36:44 +0000",
  "direction": "inbound",
  "duration": "15",
  "end_time": "Tue, 31 Aug 2010 20:36:44 +0000",
  "forwarded_from": "+141586753093",
  "from": "+18668675310",
  "from_formatted": "(415) 867-5308",
  "group_sid": null,
  "parent_call_sid": null,
  "phone_number_sid": "PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "price": "-0.03000",
  "price_unit": "USD",
  "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "start_time": "Tue, 31 Aug 2010 20:36:29 +0000",
  "status": "completed",
  "subresource_uris": {
    "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
    "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
    "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
    "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
    "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
    "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
    "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
    "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
    "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json",
    "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/TwimlSessions.json"
  },
  "to": "+14155551212",
  "to_formatted": "(415) 867-5309",
  "trunk_sid": null,
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
  "queue_time": "1000"
}
```

### StatusCallback

After completing an outbound call, Twilio will make an asynchronous HTTP request to the `StatusCallback` URL you specified in your request (if any).

#### Parameters sent to your StatusCallback URL

When Twilio sends its asynchronous request to your `StatusCallback` URL, it includes all of the following parameters:

| Parameter       | Description                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CallSid`       | A unique identifier for this call, generated by Twilio.                                                                                                                                                                                                                                                                                                                                            |
| `AccountSid`    | Your Twilio account ID. It is 34 characters long, and always starts with the letters `AC`.                                                                                                                                                                                                                                                                                                         |
| `From`          | The phone number or client identifier of the party that initiated the call.<br /><br /> Phone numbers use [E.164](/docs/glossary/what-e164) formatting, meaning they start with a + and country code, e.g. `+16175551212`.<br /><br /> Client identifiers begin with the `client:` URI scheme; for example, on a call from a client named 'charlie' the `From` parameter will be `client:charlie`. |
| `To`            | The phone number or client identifier of the called party.<br /><br /> Phone numbers use [E.164](/docs/glossary/what-e164) formatting, meaning they start with a `+` and country code, e.g. `+16175551212`.<br /><br /> Client identifiers begin with the `client:` URI scheme; for example, for a call to a client named 'joey', the `To` parameter will be `client:joey`.                        |
| `CallStatus`    | A descriptive status for the call.<br /><br /> The value is one of the following: `queued`, `initiated`, `ringing`, `in-progress`, `completed`, `busy`, `failed` or `no-answer`.                                                                                                                                                                                                                   |
| `ApiVersion`    | The version of the Twilio API used to handle this call.<br /><br /> For incoming calls, this is determined by the API version set on the dialed number.<br /><br /> For outgoing calls, this is the version used in the REST API request of the outgoing call.                                                                                                                                     |
| `Direction`     | A string describing the direction of the call:<br /><ul><li>`inbound` for inbound calls</li><li>`outbound-api` for calls initiated via the REST API</li><li>`outbound-dial` for calls initiated by a `<Dial>` verb.</li></ul>                                                                                                                                                                      |
| `ForwardedFrom` | This parameter may be set when Twilio receives a forwarded call. The carrier who forwards the call determines the contents of the parameter.<br /><br /> Not all carriers support passing this information.<br /><br /> Some carriers provide this information when making a direct call to a Twilio number.                                                                                       |
| `CallerName`    | This parameter is set when the IncomingPhoneNumber that received the call has set its `VoiceCallerIdLookup` value to `true`. Learn about [Lookup pricing](https://www.twilio.com/en-us/user-authentication-identity/pricing/lookup).                                                                                                                                                               |
| `ParentCallSid` | A unique identifier for the call that created this leg.<br /><br /> If this is the first leg of a call, this parameter is not included.                                                                                                                                                                                                                                                            |

### StatusCallbackEvent

If you specify any **call progress events** in the `StatusCallbackEvent` parameter, Twilio will make an asynchronous request to the `StatusCallback` URL you provided in your `POST` request.

The call progress events you can specify are:

| Event       | Description                                                                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initiated` | Twilio removes your call from the queue and starts dialing.                                                                                                                                                     |
| `ringing`   | The call starts ringing.                                                                                                                                                                                        |
| `answered`  | The call is answered. If this event is specified, Twilio will send an `in-progress` status.                                                                                                                     |
| `completed` | The call is completed, regardless of the termination status (which can be `busy`, `cancelled`, `completed`, `failed`, or `no-answer`). If no `StatusCallbackEvent` is specified, completed is fired by default. |

When these events occur, Twilio's `StatusCallback` request will also include these additional parameters:

| Parameter           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CallStatus`        | A descriptive status for the call. The value is one of `queued`, `initiated`, `ringing`, `in-progress`, `busy`, `failed`, or `no-answer`. For more details, see the [CallStatus values in our TwiML introduction](/docs/voice/twiml#callstatus-values).                                                                                                                                                                                                     |
| `Duration`          | The duration in minutes of the just-completed call; calls are billed by the minute. Only present in the `completed` event.                                                                                                                                                                                                                                                                                                                                  |
| `CallDuration`      | The duration in seconds of the just-completed call. Only present in the `completed` event.                                                                                                                                                                                                                                                                                                                                                                  |
| `SipResponseCode`   | The final SIP code for the call. For example, a number that was unreachable will return 404. If the Timeout value was reached before the call connected, this code will be 487.                                                                                                                                                                                                                                                                             |
| `RecordingUrl`      | The URL of the phone call's recorded audio. This parameter is included only if `Record=true` is set on the REST API request and does not include recordings initiated in other ways. `RecordingUrl` is only present in the `completed` event. The recording file may not yet be accessible when the Status Callback is sent.<br /><br /> ***Note:*** *Use RecordingStatusCallback for reliable notification on when the recording is available for access.* |
| `RecordingSid`      | The unique ID of the [Recording](/docs/voice/api/recording) from this call. `RecordingSid` is only present with the `completed` event.                                                                                                                                                                                                                                                                                                                      |
| `RecordingDuration` | The duration of the recorded audio (in seconds). `RecordingDuration` is only present in the `completed` event. To get a final accurate recording duration after any trimming of silence, use `RecordingStatusCallback`.                                                                                                                                                                                                                                     |
| `Timestamp`         | The timestamp when the event fired, given as UTC in [RFC 2822](https://php.net/manual/en/class.datetime.php#datetime.constants.rfc2822) format.                                                                                                                                                                                                                                                                                                             |
| `CallbackSource`    | A string that describes the source of the webhook. This is provided to help disambiguate why the webhook was made. On Status Callbacks, this value is always `call-progress-events`.                                                                                                                                                                                                                                                                        |
| `SequenceNumber`    | The order in which the events were fired, starting from `0`. Although events are fired in order, they are made as separate HTTP requests, and there is no guarantee they will arrive in the same order.                                                                                                                                                                                                                                                     |

> \[!NOTE]
>
> You can use the `StatusCallback` and `StatusCallbackEvent` features to track the call status of Programmable Voice calls only.

> \[!NOTE]
>
> To learn more about the `StatusCallbackEvent` parameter and what you can expect from Twilio during and after an outbound call, see [Make outbound phone calls](/docs/voice/tutorials/how-to-make-outbound-phone-calls).

### RecordingStatusCallback

If you requested a recording of your outbound call and you specified a `RecordingStatusCallback` URL, Twilio will make a `GET` or `POST` request to that URL when the recording is available.

#### Parameters sent to your RecordingStatusCallback URL

Twilio will pass along the following parameters to your `RecordingStatusCallback` URL:

| Parameter            | Description                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AccountSid`         | The unique identifier of the Account responsible for this recording.                                                                                     |
| `CallSid`            | A unique identifier for the call associated with the recording. CallSid will always refer to the parent leg of a two-leg call.                           |
| `RecordingSid`       | The unique identifier for the recording.                                                                                                                 |
| `RecordingUrl`       | The URL of the recorded audio.                                                                                                                           |
| `RecordingStatus`    | The status of the recording. Possible values are: `in-progress`, `completed`, `absent`.                                                                  |
| `RecordingDuration`  | The length of the recording, in seconds.                                                                                                                 |
| `RecordingChannels`  | The number of channels in the final recording file as an integer. Possible values are `1`, `2`.                                                          |
| `RecordingStartTime` | The timestamp of when the recording started.                                                                                                             |
| `RecordingSource`    | The initiation method used to create this recording. For recordings initiated when `Record=true` is set on the REST API, `OutboundAPI` will be returned. |
| `RecordingTrack`     | The audio track recorded. Possible values are `inbound`, `outbound`, or `both`.                                                                          |

### RecordingStatusCallbackEvent

Just as you can specify call progress events with `StatusCallbackEvent`, you can also specify which recording status changes should trigger a callback to your application.

Available recording status values are:

| Parameter     | Description                                         |
| ------------- | --------------------------------------------------- |
| `in-progress` | The recording has started.                          |
| `completed`   | The recording is complete and available for access. |
| `absent`      | The recording is absent and inaccessible.           |

This parameter defaults to `completed`. To specify multiple values, separate them with a space.

> \[!NOTE]
>
> To pause, resume, or stop recordings, see the [Recordings subresource](/docs/voice/api/recording).

## Retrieve a Call

`GET https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Calls/{Sid}.json`

This API call returns a Call resource of an individual call, identified by its `CallSid`. This resource is [eventually consistent](https://en.wikipedia.org/wiki/Eventual_consistency).

> \[!WARNING]
>
> To get real-time call status updates, we recommend using the [StatusCallbackEvent](/docs/voice/tutorials/how-to-make-outbound-phone-calls#receive-call-status-updates) or the [TwiML `<Dial>` verb statusCallbackEvent attribute](/docs/voice/twiml/number#attributes-status-callback-event) for the case of child calls.

### Path parameters

```json
[{"name":"AccountSid","in":"path","description":"The SID of the [Account](/docs/iam/api/account) that created the Call resource(s) to fetch.","schema":{"type":"string","minLength":34,"maxLength":34,"pattern":"^AC[0-9a-fA-F]{32}$"},"required":true},{"name":"Sid","in":"path","description":"The SID of the Call resource to fetch.","schema":{"type":"string","minLength":34,"maxLength":34,"pattern":"^CA[0-9a-fA-F]{32}$"},"required":true}]
```

Retrieve a Call

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function fetchCall() {
  const call = await client.calls("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").fetch();

  console.log(call.sid);
}

fetchCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

call = client.calls("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").fetch()

print(call.sid)
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        var call = await CallResource.FetchAsync(pathSid: "CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

        Console.WriteLine(call.Sid);
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        Call call = Call.fetcher("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").fetch();

        System.out.println(call.getSid());
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.FetchCallParams{}

	resp, err := client.Api.FetchCall("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
		params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	} else {
		if resp.Sid != nil {
			fmt.Println(*resp.Sid)
		} else {
			fmt.Println(resp.Sid)
		}
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$call = $twilio->calls("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX")->fetch();

print $call->sid;
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

call = @client
       .api
       .v2010
       .calls('CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')
       .fetch

puts call.sid
```

```bash
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:fetch \
   --sid CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

```bash
curl -X GET "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls/CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.json" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

```json
{
  "account_sid": "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "answered_by": "machine_start",
  "api_version": "2010-04-01",
  "caller_name": "callerid",
  "date_created": "Fri, 18 Oct 2019 17:00:00 +0000",
  "date_updated": "Fri, 18 Oct 2019 17:01:00 +0000",
  "direction": "outbound-api",
  "duration": "4",
  "end_time": "Fri, 18 Oct 2019 17:03:00 +0000",
  "forwarded_from": "calledvia",
  "from": "+13051416799",
  "from_formatted": "(305) 141-6799",
  "group_sid": "GPdeadbeefdeadbeefdeadbeefdeadbeef",
  "parent_call_sid": "CAdeadbeefdeadbeefdeadbeefdeadbeef",
  "phone_number_sid": "PNdeadbeefdeadbeefdeadbeefdeadbeef",
  "price": "-0.200",
  "price_unit": "USD",
  "sid": "CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "start_time": "Fri, 18 Oct 2019 17:02:00 +0000",
  "status": "completed",
  "subresource_uris": {
    "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
    "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
    "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
    "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
    "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
    "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
    "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
    "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
    "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json",
    "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/TwimlSessions.json"
  },
  "to": "+13051913581",
  "to_formatted": "(305) 191-3581",
  "trunk_sid": "TKdeadbeefdeadbeefdeadbeefdeadbeef",
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
  "queue_time": "1000"
}
```

### Recordings

You can access the Recordings subresource on any given Call.

The following will return a list of all of the recordings generated with a given call (identified by its `CallSid`):

```bash
/2010-04-01/Accounts/{YourAccountSid}/Calls/{CallSid}/Recordings
```

Learn more about the [Recordings resource](/docs/voice/api/recording).

## Retrieve a list of Calls

`GET https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Calls.json`

Return a list of phone calls made to and from an account, identified by its `AccountSid`.

The following query string parameters allow you to filter and limit the list returned to you by the REST API. **These parameters are case-sensitive.**

### Path parameters

```json
[{"name":"AccountSid","in":"path","description":"The SID of the [Account](/docs/iam/api/account) that created the Call resource(s) to read.","schema":{"type":"string","minLength":34,"maxLength":34,"pattern":"^AC[0-9a-fA-F]{32}$"},"required":true}]
```

### Query parameters

```json
[{"name":"To","in":"query","description":"Only show calls made to this phone number, SIP address, Client identifier or SIM SID.","schema":{"type":"string","format":"phone-number"},"x-twilio":{"pii":{"handling":"standard","deleteSla":120}},"examples":{"readFullPage1":{"value":"+123456789"},"readFullPage2":{"value":"+123456789"},"readEmptyDatesGreater":{"value":"+123456789"},"readEmptyDatesLess":{"value":"+123456789"},"readEmptyDateFunDateFormats":{"value":"+123456789"}}},{"name":"From","in":"query","description":"Only include calls from this phone number, SIP address, Client identifier or SIM SID.","schema":{"type":"string","format":"phone-number"},"x-twilio":{"pii":{"handling":"standard","deleteSla":120}},"examples":{"readFullPage1":{"value":"+987654321"},"readFullPage2":{"value":"+987654321"},"readEmptyDatesGreater":{"value":"+987654321"},"readEmptyDatesLess":{"value":"+987654321"},"readEmptyDateFunDateFormats":{"value":"+987654321"}}},{"name":"ParentCallSid","in":"query","description":"Only include calls spawned by calls with this SID.","schema":{"type":"string","minLength":34,"maxLength":34,"pattern":"^CA[0-9a-fA-F]{32}$"},"examples":{"readFullPage1":{"value":"CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"readFullPage2":{"value":"CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"readEmptyDatesGreater":{"value":"CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"readEmptyDatesLess":{"value":"CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"readEmptyDateFunDateFormats":{"value":"CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}},{"name":"Status","in":"query","description":"The status of the calls to include. Can be: `queued`, `ringing`, `in-progress`, `canceled`, `completed`, `failed`, `busy`, or `no-answer`.","schema":{"type":"string","enum":["queued","ringing","in-progress","completed","busy","failed","no-answer","canceled"],"description":"The status of this call. Can be: `queued`, `ringing`, `in-progress`, `canceled`, `completed`, `failed`, `busy` or `no-answer`. See [Call Status Values](/docs/voice/api/call-resource#call-status-values) below for more information.","refName":"call_enum_status","modelName":"call_enum_status"},"examples":{"readFullPage1":{"value":"completed"},"readFullPage2":{"value":"completed"},"readEmptyDatesGreater":{"value":"completed"},"readEmptyDatesLess":{"value":"completed"},"readEmptyDateFunDateFormats":{"value":"completed"}}},{"name":"StartTime","in":"query","description":"Only include calls that started on this date. Specify a date as `YYYY-MM-DD` in UTC, for example: `2009-07-06`, to read only calls that started on this date. You can also specify an inequality, such as `StartTime<=YYYY-MM-DD`, to read calls that started on or before midnight of this date, and `StartTime>=YYYY-MM-DD` to read calls that started on or after midnight of this date.","schema":{"type":"string","format":"date-time"},"examples":{"readFullPage1":{"value":"2008-01-02"},"readFullPage2":{"value":"2008-01-02"}}},{"name":"StartTime<","in":"query","description":"Only include calls that started on this date. Specify a date as `YYYY-MM-DD` in UTC, for example: `2009-07-06`, to read only calls that started on this date. You can also specify an inequality, such as `StartTime<=YYYY-MM-DD`, to read calls that started on or before midnight of this date, and `StartTime>=YYYY-MM-DD` to read calls that started on or after midnight of this date.","schema":{"type":"string","format":"date-time"},"examples":{"readEmptyDatesLess":{"value":"2008-01-02"},"readEmptyDateFunDateFormats":{"value":"06/11/2019 22:05:25 MST"}}},{"name":"StartTime>","in":"query","description":"Only include calls that started on this date. Specify a date as `YYYY-MM-DD` in UTC, for example: `2009-07-06`, to read only calls that started on this date. You can also specify an inequality, such as `StartTime<=YYYY-MM-DD`, to read calls that started on or before midnight of this date, and `StartTime>=YYYY-MM-DD` to read calls that started on or after midnight of this date.","schema":{"type":"string","format":"date-time"},"examples":{"readEmptyDatesGreater":{"value":"2008-01-02"}}},{"name":"EndTime","in":"query","description":"Only include calls that ended on this date. Specify a date as `YYYY-MM-DD` in UTC, for example: `2009-07-06`, to read only calls that ended on this date. You can also specify an inequality, such as `EndTime<=YYYY-MM-DD`, to read calls that ended on or before midnight of this date, and `EndTime>=YYYY-MM-DD` to read calls that ended on or after midnight of this date.","schema":{"type":"string","format":"date-time"},"examples":{"readFullPage1":{"value":"2009-01-02"},"readFullPage2":{"value":"2009-01-02"}}},{"name":"EndTime<","in":"query","description":"Only include calls that ended on this date. Specify a date as `YYYY-MM-DD` in UTC, for example: `2009-07-06`, to read only calls that ended on this date. You can also specify an inequality, such as `EndTime<=YYYY-MM-DD`, to read calls that ended on or before midnight of this date, and `EndTime>=YYYY-MM-DD` to read calls that ended on or after midnight of this date.","schema":{"type":"string","format":"date-time"},"examples":{"readEmptyDatesLess":{"value":"2009-01-02"},"readEmptyDateFunDateFormats":{"value":"2019-06-11 22:05:25.000"}}},{"name":"EndTime>","in":"query","description":"Only include calls that ended on this date. Specify a date as `YYYY-MM-DD` in UTC, for example: `2009-07-06`, to read only calls that ended on this date. You can also specify an inequality, such as `EndTime<=YYYY-MM-DD`, to read calls that ended on or before midnight of this date, and `EndTime>=YYYY-MM-DD` to read calls that ended on or after midnight of this date.","schema":{"type":"string","format":"date-time"},"examples":{"readEmptyDatesGreater":{"value":"2009-01-02"}}},{"name":"PageSize","in":"query","description":"How many resources to return in each list page. The default is 50, and the maximum is 1000.","schema":{"type":"integer","format":"int64","minimum":1,"maximum":1000}},{"name":"Page","in":"query","description":"The page index. This value is simply for client state.","schema":{"type":"integer","minimum":0}},{"name":"PageToken","in":"query","description":"The page token. This is provided by the API.","schema":{"type":"string"}}]
```

Retrieve a list of Calls

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function listCall() {
  const calls = await client.calls.list({ limit: 20 });

  calls.forEach((c) => console.log(c.sid));
}

listCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

calls = client.calls.list(limit=20)

for record in calls:
    print(record.sid)
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        var calls = await CallResource.ReadAsync(limit: 20);

        foreach (var record in calls) {
            Console.WriteLine(record.Sid);
        }
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;
import com.twilio.base.ResourceSet;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        ResourceSet<Call> calls = Call.reader().limit(20).read();

        for (Call record : calls) {
            System.out.println(record.getSid());
        }
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.ListCallParams{}
	params.SetLimit(20)

	resp, err := client.Api.ListCall(params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	} else {
		for record := range resp {
			if resp[record].Sid != nil {
				fmt.Println(*resp[record].Sid)
			} else {
				fmt.Println(resp[record].Sid)
			}
		}
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$calls = $twilio->calls->read([], 20);

foreach ($calls as $record) {
    print $record->sid;
}
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

calls = @client
        .api
        .v2010
        .calls
        .list(limit: 20)

calls.each do |record|
   puts record.sid
end
```

```bash
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:list
```

```bash
curl -X GET "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls.json?PageSize=20" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

```json
{
  "calls": [
    {
      "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "answered_by": "machine_start",
      "api_version": "2010-04-01",
      "caller_name": "callerid1",
      "date_created": "Fri, 18 Oct 2019 17:00:00 +0000",
      "date_updated": "Fri, 18 Oct 2019 17:01:00 +0000",
      "direction": "outbound-api",
      "duration": "4",
      "end_time": "Fri, 18 Oct 2019 17:03:00 +0000",
      "forwarded_from": "calledvia1",
      "from": "+13051416799",
      "from_formatted": "(305) 141-6799",
      "group_sid": "GPdeadbeefdeadbeefdeadbeefdeadbeef",
      "parent_call_sid": "CAdeadbeefdeadbeefdeadbeefdeadbeef",
      "phone_number_sid": "PNdeadbeefdeadbeefdeadbeefdeadbeef",
      "price": "-0.200",
      "price_unit": "USD",
      "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "start_time": "Fri, 18 Oct 2019 17:02:00 +0000",
      "status": "completed",
      "subresource_uris": {
        "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
        "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
        "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
        "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
        "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
        "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
        "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
        "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
        "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json",
        "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/TwimlSessions.json"
      },
      "to": "+13051913581",
      "to_formatted": "(305) 191-3581",
      "trunk_sid": "TKdeadbeefdeadbeefdeadbeefdeadbeef",
      "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
      "queue_time": "1000"
    },
    {
      "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "answered_by": "human",
      "api_version": "2010-04-01",
      "caller_name": "callerid2",
      "date_created": "Fri, 18 Oct 2019 16:00:00 +0000",
      "date_updated": "Fri, 18 Oct 2019 16:01:00 +0000",
      "direction": "inbound",
      "duration": "3",
      "end_time": "Fri, 18 Oct 2019 16:03:00 +0000",
      "forwarded_from": "calledvia2",
      "from": "+13051416798",
      "from_formatted": "(305) 141-6798",
      "group_sid": "GPdeadbeefdeadbeefdeadbeefdeadbeee",
      "parent_call_sid": "CAdeadbeefdeadbeefdeadbeefdeadbeee",
      "phone_number_sid": "PNdeadbeefdeadbeefdeadbeefdeadbeee",
      "price": "-0.100",
      "price_unit": "JPY",
      "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0",
      "start_time": "Fri, 18 Oct 2019 16:02:00 +0000",
      "status": "completed",
      "subresource_uris": {
        "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Notifications.json",
        "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Recordings.json",
        "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Payments.json",
        "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Events.json",
        "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Siprec.json",
        "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Streams.json",
        "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Transcriptions.json",
        "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/UserDefinedMessageSubscriptions.json",
        "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/UserDefinedMessages.json",
        "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/TwimlSessions.json"
      },
      "to": "+13051913580",
      "to_formatted": "(305) 191-3580",
      "trunk_sid": "TKdeadbeefdeadbeefdeadbeefdeadbeef",
      "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0.json",
      "queue_time": "1000"
    }
  ],
  "end": 1,
  "first_page_uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=0",
  "next_page_uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=1&PageToken=PACAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0",
  "page": 0,
  "page_size": 2,
  "previous_page_uri": null,
  "start": 0,
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=0"
}
```

Retrieve a list of Calls and filter by start date

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function listCall() {
  const calls = await client.calls.list({
    startTime: new Date("2009-07-06 00:00:00"),
    status: "completed",
    limit: 20,
  });

  calls.forEach((c) => console.log(c.sid));
}

listCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client
from datetime import datetime

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

calls = client.calls.list(
    status="completed", start_time=datetime(2009, 7, 6, 0, 0, 0), limit=20
)

for record in calls:
    print(record.sid)
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        var calls = await CallResource.ReadAsync(
            status: CallResource.StatusEnum.Completed,
            startTime: new DateTime(2009, 7, 6, 0, 0, 0),
            limit: 20);

        foreach (var record in calls) {
            Console.WriteLine(record.Sid);
        }
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import java.time.ZoneId;
import java.time.ZonedDateTime;
import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;
import com.twilio.base.ResourceSet;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        ResourceSet<Call> calls = Call.reader()
                                      .setStatus(Call.Status.COMPLETED)
                                      .setStartTime(ZonedDateTime.of(2009, 7, 6, 0, 0, 0, 0, ZoneId.of("UTC")))
                                      .limit(20)
                                      .read();

        for (Call record : calls) {
            System.out.println(record.getSid());
        }
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
	"time"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.ListCallParams{}
	params.SetStatus("completed")
	params.SetStartTime(time.Date(2009, 7, 6, 0, 0, 0, 0, time.UTC))
	params.SetLimit(20)

	resp, err := client.Api.ListCall(params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	} else {
		for record := range resp {
			if resp[record].Sid != nil {
				fmt.Println(*resp[record].Sid)
			} else {
				fmt.Println(resp[record].Sid)
			}
		}
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$calls = $twilio->calls->read(
    [
        "status" => "completed",
        "startTime" => new \DateTime("2009-07-06T00:00:00Z"),
    ],
    20
);

foreach ($calls as $record) {
    print $record->sid;
}
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

calls = @client
        .api
        .v2010
        .calls
        .list(
          status: 'completed',
          start_time: Time.new(2009, 7, 6, 0, 0, 0),
          limit: 20
        )

calls.each do |record|
   puts record.sid
end
```

```bash
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:list \
   --status completed \
   --start-time 2016-07-31
```

```bash
curl -X GET "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls.json?Status=completed&StartTime=2016-07-31&PageSize=20" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

```json
{
  "calls": [
    {
      "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "answered_by": "machine_start",
      "api_version": "2010-04-01",
      "caller_name": "callerid1",
      "date_created": "Fri, 18 Oct 2019 17:00:00 +0000",
      "date_updated": "Fri, 18 Oct 2019 17:01:00 +0000",
      "direction": "outbound-api",
      "duration": "4",
      "end_time": "Fri, 18 Oct 2019 17:03:00 +0000",
      "forwarded_from": "calledvia1",
      "from": "+13051416799",
      "from_formatted": "(305) 141-6799",
      "group_sid": "GPdeadbeefdeadbeefdeadbeefdeadbeef",
      "parent_call_sid": "CAdeadbeefdeadbeefdeadbeefdeadbeef",
      "phone_number_sid": "PNdeadbeefdeadbeefdeadbeefdeadbeef",
      "price": "-0.200",
      "price_unit": "USD",
      "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "start_time": "Fri, 18 Oct 2019 17:02:00 +0000",
      "status": "completed",
      "subresource_uris": {
        "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
        "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
        "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
        "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
        "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
        "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
        "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
        "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
        "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json",
        "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/TwimlSessions.json"
      },
      "to": "+13051913581",
      "to_formatted": "(305) 191-3581",
      "trunk_sid": "TKdeadbeefdeadbeefdeadbeefdeadbeef",
      "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
      "queue_time": "1000"
    },
    {
      "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "answered_by": "human",
      "api_version": "2010-04-01",
      "caller_name": "callerid2",
      "date_created": "Fri, 18 Oct 2019 16:00:00 +0000",
      "date_updated": "Fri, 18 Oct 2019 16:01:00 +0000",
      "direction": "inbound",
      "duration": "3",
      "end_time": "Fri, 18 Oct 2019 16:03:00 +0000",
      "forwarded_from": "calledvia2",
      "from": "+13051416798",
      "from_formatted": "(305) 141-6798",
      "group_sid": "GPdeadbeefdeadbeefdeadbeefdeadbeee",
      "parent_call_sid": "CAdeadbeefdeadbeefdeadbeefdeadbeee",
      "phone_number_sid": "PNdeadbeefdeadbeefdeadbeefdeadbeee",
      "price": "-0.100",
      "price_unit": "JPY",
      "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0",
      "start_time": "Fri, 18 Oct 2019 16:02:00 +0000",
      "status": "completed",
      "subresource_uris": {
        "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Notifications.json",
        "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Recordings.json",
        "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Payments.json",
        "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Events.json",
        "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Siprec.json",
        "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Streams.json",
        "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Transcriptions.json",
        "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/UserDefinedMessageSubscriptions.json",
        "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/UserDefinedMessages.json",
        "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/TwimlSessions.json"
      },
      "to": "+13051913580",
      "to_formatted": "(305) 191-3580",
      "trunk_sid": "TKdeadbeefdeadbeefdeadbeefdeadbeef",
      "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0.json",
      "queue_time": "1000"
    }
  ],
  "end": 1,
  "first_page_uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=0",
  "next_page_uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=1&PageToken=PACAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0",
  "page": 0,
  "page_size": 2,
  "previous_page_uri": null,
  "start": 0,
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=0"
}
```

Retrieve a list of Calls and filter by 'after start' date

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function listCall() {
  const calls = await client.calls.list({
    startTimeAfter: new Date("2009-07-06 00:00:00"),
    status: "completed",
    limit: 20,
  });

  calls.forEach((c) => console.log(c.sid));
}

listCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client
from datetime import datetime

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

calls = client.calls.list(
    status="completed", start_time_after=datetime(2009, 7, 6, 0, 0, 0), limit=20
)

for record in calls:
    print(record.sid)
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        var calls = await CallResource.ReadAsync(
            status: CallResource.StatusEnum.Completed,
            startTimeAfter: new DateTime(2009, 7, 6, 0, 0, 0),
            limit: 20);

        foreach (var record in calls) {
            Console.WriteLine(record.Sid);
        }
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import java.time.ZoneId;
import java.time.ZonedDateTime;
import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;
import com.twilio.base.ResourceSet;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        ResourceSet<Call> calls = Call.reader()
                                      .setStatus(Call.Status.COMPLETED)
                                      .setStartTimeAfter(ZonedDateTime.of(2009, 7, 6, 0, 0, 0, 0, ZoneId.of("UTC")))
                                      .limit(20)
                                      .read();

        for (Call record : calls) {
            System.out.println(record.getSid());
        }
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
	"time"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.ListCallParams{}
	params.SetStatus("completed")
	params.SetStartTimeAfter(time.Date(2009, 7, 6, 0, 0, 0, 0, time.UTC))
	params.SetLimit(20)

	resp, err := client.Api.ListCall(params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	} else {
		for record := range resp {
			if resp[record].Sid != nil {
				fmt.Println(*resp[record].Sid)
			} else {
				fmt.Println(resp[record].Sid)
			}
		}
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$calls = $twilio->calls->read(
    [
        "status" => "completed",
        "startTimeAfter" => new \DateTime("2009-07-06T00:00:00Z"),
    ],
    20
);

foreach ($calls as $record) {
    print $record->sid;
}
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

calls = @client
        .api
        .v2010
        .calls
        .list(
          status: 'completed',
          start_time_after: Time.new(2009, 7, 6, 0, 0, 0),
          limit: 20
        )

calls.each do |record|
   puts record.sid
end
```

```bash
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:list \
   --status completed \
   --start-time-after 2016-07-31
```

```bash
curl -X GET "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls.json?Status=completed&StartTimeAfter=2016-07-31&PageSize=20" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

```json
{
  "calls": [
    {
      "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "answered_by": "machine_start",
      "api_version": "2010-04-01",
      "caller_name": "callerid1",
      "date_created": "Fri, 18 Oct 2019 17:00:00 +0000",
      "date_updated": "Fri, 18 Oct 2019 17:01:00 +0000",
      "direction": "outbound-api",
      "duration": "4",
      "end_time": "Fri, 18 Oct 2019 17:03:00 +0000",
      "forwarded_from": "calledvia1",
      "from": "+13051416799",
      "from_formatted": "(305) 141-6799",
      "group_sid": "GPdeadbeefdeadbeefdeadbeefdeadbeef",
      "parent_call_sid": "CAdeadbeefdeadbeefdeadbeefdeadbeef",
      "phone_number_sid": "PNdeadbeefdeadbeefdeadbeefdeadbeef",
      "price": "-0.200",
      "price_unit": "USD",
      "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "start_time": "Fri, 18 Oct 2019 17:02:00 +0000",
      "status": "completed",
      "subresource_uris": {
        "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
        "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
        "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
        "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
        "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
        "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
        "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
        "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
        "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json",
        "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/TwimlSessions.json"
      },
      "to": "+13051913581",
      "to_formatted": "(305) 191-3581",
      "trunk_sid": "TKdeadbeefdeadbeefdeadbeefdeadbeef",
      "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
      "queue_time": "1000"
    },
    {
      "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "answered_by": "human",
      "api_version": "2010-04-01",
      "caller_name": "callerid2",
      "date_created": "Fri, 18 Oct 2019 16:00:00 +0000",
      "date_updated": "Fri, 18 Oct 2019 16:01:00 +0000",
      "direction": "inbound",
      "duration": "3",
      "end_time": "Fri, 18 Oct 2019 16:03:00 +0000",
      "forwarded_from": "calledvia2",
      "from": "+13051416798",
      "from_formatted": "(305) 141-6798",
      "group_sid": "GPdeadbeefdeadbeefdeadbeefdeadbeee",
      "parent_call_sid": "CAdeadbeefdeadbeefdeadbeefdeadbeee",
      "phone_number_sid": "PNdeadbeefdeadbeefdeadbeefdeadbeee",
      "price": "-0.100",
      "price_unit": "JPY",
      "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0",
      "start_time": "Fri, 18 Oct 2019 16:02:00 +0000",
      "status": "completed",
      "subresource_uris": {
        "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Notifications.json",
        "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Recordings.json",
        "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Payments.json",
        "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Events.json",
        "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Siprec.json",
        "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Streams.json",
        "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Transcriptions.json",
        "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/UserDefinedMessageSubscriptions.json",
        "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/UserDefinedMessages.json",
        "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/TwimlSessions.json"
      },
      "to": "+13051913580",
      "to_formatted": "(305) 191-3580",
      "trunk_sid": "TKdeadbeefdeadbeefdeadbeefdeadbeef",
      "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0.json",
      "queue_time": "1000"
    }
  ],
  "end": 1,
  "first_page_uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=0",
  "next_page_uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=1&PageToken=PACAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0",
  "page": 0,
  "page_size": 2,
  "previous_page_uri": null,
  "start": 0,
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=0"
}
```

Retrieve a list of Calls and filter by a period of time

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function listCall() {
  const calls = await client.calls.list({
    startTimeBefore: new Date("2009-07-06 00:00:00"),
    startTimeAfter: new Date("2009-07-04 00:00:00"),
    status: "in-progress",
    limit: 20,
  });

  calls.forEach((c) => console.log(c.sid));
}

listCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client
from datetime import datetime

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

calls = client.calls.list(
    status="in-progress",
    start_time_before=datetime(2009, 7, 6, 0, 0, 0),
    start_time_after=datetime(2009, 7, 4, 0, 0, 0),
    limit=20,
)

for record in calls:
    print(record.sid)
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        var calls = await CallResource.ReadAsync(
            status: CallResource.StatusEnum.InProgress,
            startTimeBefore: new DateTime(2009, 7, 6, 0, 0, 0),
            startTimeAfter: new DateTime(2009, 7, 4, 0, 0, 0),
            limit: 20);

        foreach (var record in calls) {
            Console.WriteLine(record.Sid);
        }
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import java.time.ZoneId;
import java.time.ZonedDateTime;
import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;
import com.twilio.base.ResourceSet;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        ResourceSet<Call> calls = Call.reader()
                                      .setStatus(Call.Status.IN_PROGRESS)
                                      .setStartTimeBefore(ZonedDateTime.of(2009, 7, 6, 0, 0, 0, 0, ZoneId.of("UTC")))
                                      .setStartTimeAfter(ZonedDateTime.of(2009, 7, 4, 0, 0, 0, 0, ZoneId.of("UTC")))
                                      .limit(20)
                                      .read();

        for (Call record : calls) {
            System.out.println(record.getSid());
        }
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
	"time"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.ListCallParams{}
	params.SetStatus("in-progress")
	params.SetStartTimeBefore(time.Date(2009, 7, 6, 0, 0, 0, 0, time.UTC))
	params.SetStartTimeAfter(time.Date(2009, 7, 4, 0, 0, 0, 0, time.UTC))
	params.SetLimit(20)

	resp, err := client.Api.ListCall(params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	} else {
		for record := range resp {
			if resp[record].Sid != nil {
				fmt.Println(*resp[record].Sid)
			} else {
				fmt.Println(resp[record].Sid)
			}
		}
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$calls = $twilio->calls->read(
    [
        "status" => "in-progress",
        "startTimeBefore" => new \DateTime("2009-07-06T00:00:00Z"),
        "startTimeAfter" => new \DateTime("2009-07-04T00:00:00Z"),
    ],
    20
);

foreach ($calls as $record) {
    print $record->sid;
}
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

calls = @client
        .api
        .v2010
        .calls
        .list(
          status: 'in-progress',
          start_time_before: Time.new(2009, 7, 6, 0, 0, 0),
          start_time_after: Time.new(2009, 7, 4, 0, 0, 0),
          limit: 20
        )

calls.each do |record|
   puts record.sid
end
```

```bash
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:list \
   --status in-progress \
   --start-time-before 2016-07-31 \
   --start-time-after 2016-07-31
```

```bash
curl -X GET "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls.json?Status=in-progress&StartTimeBefore=2016-07-31&StartTimeAfter=2016-07-31&PageSize=20" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

```json
{
  "calls": [
    {
      "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "answered_by": "machine_start",
      "api_version": "2010-04-01",
      "caller_name": "callerid1",
      "date_created": "Fri, 18 Oct 2019 17:00:00 +0000",
      "date_updated": "Fri, 18 Oct 2019 17:01:00 +0000",
      "direction": "outbound-api",
      "duration": "4",
      "end_time": "Fri, 18 Oct 2019 17:03:00 +0000",
      "forwarded_from": "calledvia1",
      "from": "+13051416799",
      "from_formatted": "(305) 141-6799",
      "group_sid": "GPdeadbeefdeadbeefdeadbeefdeadbeef",
      "parent_call_sid": "CAdeadbeefdeadbeefdeadbeefdeadbeef",
      "phone_number_sid": "PNdeadbeefdeadbeefdeadbeefdeadbeef",
      "price": "-0.200",
      "price_unit": "USD",
      "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "start_time": "Fri, 18 Oct 2019 17:02:00 +0000",
      "status": "completed",
      "subresource_uris": {
        "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
        "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
        "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
        "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
        "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
        "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
        "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
        "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
        "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json",
        "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/TwimlSessions.json"
      },
      "to": "+13051913581",
      "to_formatted": "(305) 191-3581",
      "trunk_sid": "TKdeadbeefdeadbeefdeadbeefdeadbeef",
      "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
      "queue_time": "1000"
    },
    {
      "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "answered_by": "human",
      "api_version": "2010-04-01",
      "caller_name": "callerid2",
      "date_created": "Fri, 18 Oct 2019 16:00:00 +0000",
      "date_updated": "Fri, 18 Oct 2019 16:01:00 +0000",
      "direction": "inbound",
      "duration": "3",
      "end_time": "Fri, 18 Oct 2019 16:03:00 +0000",
      "forwarded_from": "calledvia2",
      "from": "+13051416798",
      "from_formatted": "(305) 141-6798",
      "group_sid": "GPdeadbeefdeadbeefdeadbeefdeadbeee",
      "parent_call_sid": "CAdeadbeefdeadbeefdeadbeefdeadbeee",
      "phone_number_sid": "PNdeadbeefdeadbeefdeadbeefdeadbeee",
      "price": "-0.100",
      "price_unit": "JPY",
      "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0",
      "start_time": "Fri, 18 Oct 2019 16:02:00 +0000",
      "status": "completed",
      "subresource_uris": {
        "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Notifications.json",
        "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Recordings.json",
        "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Payments.json",
        "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Events.json",
        "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Siprec.json",
        "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Streams.json",
        "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Transcriptions.json",
        "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/UserDefinedMessageSubscriptions.json",
        "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/UserDefinedMessages.json",
        "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/TwimlSessions.json"
      },
      "to": "+13051913580",
      "to_formatted": "(305) 191-3580",
      "trunk_sid": "TKdeadbeefdeadbeefdeadbeefdeadbeef",
      "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0.json",
      "queue_time": "1000"
    }
  ],
  "end": 1,
  "first_page_uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=0",
  "next_page_uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=1&PageToken=PACAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0",
  "page": 0,
  "page_size": 2,
  "previous_page_uri": null,
  "start": 0,
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=0"
}
```

Retrieve a list of Calls and filter by call status and phone number

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function listCall() {
  const calls = await client.calls.list({
    status: "busy",
    to: "+15558675310",
    limit: 20,
  });

  calls.forEach((c) => console.log(c.sid));
}

listCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

calls = client.calls.list(to="+15558675310", status="busy", limit=20)

for record in calls:
    print(record.sid)
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        var calls = await CallResource.ReadAsync(
            to: new Twilio.Types.PhoneNumber("+15558675310"),
            status: CallResource.StatusEnum.Busy,
            limit: 20);

        foreach (var record in calls) {
            Console.WriteLine(record.Sid);
        }
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import com.twilio.type.PhoneNumber;
import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;
import com.twilio.base.ResourceSet;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        ResourceSet<Call> calls = Call.reader()
                                      .setTo(new com.twilio.type.PhoneNumber("+15558675310"))
                                      .setStatus(Call.Status.BUSY)
                                      .limit(20)
                                      .read();

        for (Call record : calls) {
            System.out.println(record.getSid());
        }
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.ListCallParams{}
	params.SetTo("+15558675310")
	params.SetStatus("busy")
	params.SetLimit(20)

	resp, err := client.Api.ListCall(params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	} else {
		for record := range resp {
			if resp[record].Sid != nil {
				fmt.Println(*resp[record].Sid)
			} else {
				fmt.Println(resp[record].Sid)
			}
		}
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$calls = $twilio->calls->read(
    [
        "to" => "+15558675310",
        "status" => "busy",
    ],
    20
);

foreach ($calls as $record) {
    print $record->sid;
}
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

calls = @client
        .api
        .v2010
        .calls
        .list(
          to: '+15558675310',
          status: 'busy',
          limit: 20
        )

calls.each do |record|
   puts record.sid
end
```

```bash
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:list \
   --to +15558675310 \
   --status busy
```

```bash
curl -X GET "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls.json?To=%2B15558675310&Status=busy&PageSize=20" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

```json
{
  "calls": [
    {
      "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "answered_by": "machine_start",
      "api_version": "2010-04-01",
      "caller_name": "callerid1",
      "date_created": "Fri, 18 Oct 2019 17:00:00 +0000",
      "date_updated": "Fri, 18 Oct 2019 17:01:00 +0000",
      "direction": "outbound-api",
      "duration": "4",
      "end_time": "Fri, 18 Oct 2019 17:03:00 +0000",
      "forwarded_from": "calledvia1",
      "from": "+13051416799",
      "from_formatted": "(305) 141-6799",
      "group_sid": "GPdeadbeefdeadbeefdeadbeefdeadbeef",
      "parent_call_sid": "CAdeadbeefdeadbeefdeadbeefdeadbeef",
      "phone_number_sid": "PNdeadbeefdeadbeefdeadbeefdeadbeef",
      "price": "-0.200",
      "price_unit": "USD",
      "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "start_time": "Fri, 18 Oct 2019 17:02:00 +0000",
      "status": "completed",
      "subresource_uris": {
        "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
        "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
        "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
        "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
        "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
        "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
        "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
        "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
        "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json",
        "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/TwimlSessions.json"
      },
      "to": "+13051913581",
      "to_formatted": "(305) 191-3581",
      "trunk_sid": "TKdeadbeefdeadbeefdeadbeefdeadbeef",
      "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
      "queue_time": "1000"
    },
    {
      "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "answered_by": "human",
      "api_version": "2010-04-01",
      "caller_name": "callerid2",
      "date_created": "Fri, 18 Oct 2019 16:00:00 +0000",
      "date_updated": "Fri, 18 Oct 2019 16:01:00 +0000",
      "direction": "inbound",
      "duration": "3",
      "end_time": "Fri, 18 Oct 2019 16:03:00 +0000",
      "forwarded_from": "calledvia2",
      "from": "+13051416798",
      "from_formatted": "(305) 141-6798",
      "group_sid": "GPdeadbeefdeadbeefdeadbeefdeadbeee",
      "parent_call_sid": "CAdeadbeefdeadbeefdeadbeefdeadbeee",
      "phone_number_sid": "PNdeadbeefdeadbeefdeadbeefdeadbeee",
      "price": "-0.100",
      "price_unit": "JPY",
      "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0",
      "start_time": "Fri, 18 Oct 2019 16:02:00 +0000",
      "status": "completed",
      "subresource_uris": {
        "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Notifications.json",
        "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Recordings.json",
        "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Payments.json",
        "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Events.json",
        "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Siprec.json",
        "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Streams.json",
        "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Transcriptions.json",
        "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/UserDefinedMessageSubscriptions.json",
        "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/UserDefinedMessages.json",
        "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/TwimlSessions.json"
      },
      "to": "+13051913580",
      "to_formatted": "(305) 191-3580",
      "trunk_sid": "TKdeadbeefdeadbeefdeadbeefdeadbeef",
      "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0.json",
      "queue_time": "1000"
    }
  ],
  "end": 1,
  "first_page_uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=0",
  "next_page_uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=1&PageToken=PACAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0",
  "page": 0,
  "page_size": 2,
  "previous_page_uri": null,
  "start": 0,
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=0"
}
```

Retrieve a list of Calls and filter by calls made from a specific device

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function listCall() {
  const calls = await client.calls.list({
    from: "client:charlie",
    limit: 20,
  });

  calls.forEach((c) => console.log(c.sid));
}

listCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

calls = client.calls.list(from_="client:charlie", limit=20)

for record in calls:
    print(record.sid)
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        var calls = await CallResource.ReadAsync(
            from: new Twilio.Types.PhoneNumber("client:charlie"), limit: 20);

        foreach (var record in calls) {
            Console.WriteLine(record.Sid);
        }
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import com.twilio.type.PhoneNumber;
import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;
import com.twilio.base.ResourceSet;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        ResourceSet<Call> calls =
            Call.reader().setFrom(new com.twilio.type.PhoneNumber("client:charlie")).limit(20).read();

        for (Call record : calls) {
            System.out.println(record.getSid());
        }
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.ListCallParams{}
	params.SetFrom("client:charlie")
	params.SetLimit(20)

	resp, err := client.Api.ListCall(params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	} else {
		for record := range resp {
			if resp[record].Sid != nil {
				fmt.Println(*resp[record].Sid)
			} else {
				fmt.Println(resp[record].Sid)
			}
		}
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$calls = $twilio->calls->read(["from" => "client:charlie"], 20);

foreach ($calls as $record) {
    print $record->sid;
}
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

calls = @client
        .api
        .v2010
        .calls
        .list(
          from: 'client:charlie',
          limit: 20
        )

calls.each do |record|
   puts record.sid
end
```

```bash
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:list \
   --from client:charlie
```

```bash
curl -X GET "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls.json?From=client%3Acharlie&PageSize=20" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

```json
{
  "calls": [
    {
      "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "answered_by": "machine_start",
      "api_version": "2010-04-01",
      "caller_name": "callerid1",
      "date_created": "Fri, 18 Oct 2019 17:00:00 +0000",
      "date_updated": "Fri, 18 Oct 2019 17:01:00 +0000",
      "direction": "outbound-api",
      "duration": "4",
      "end_time": "Fri, 18 Oct 2019 17:03:00 +0000",
      "forwarded_from": "calledvia1",
      "from": "+13051416799",
      "from_formatted": "(305) 141-6799",
      "group_sid": "GPdeadbeefdeadbeefdeadbeefdeadbeef",
      "parent_call_sid": "CAdeadbeefdeadbeefdeadbeefdeadbeef",
      "phone_number_sid": "PNdeadbeefdeadbeefdeadbeefdeadbeef",
      "price": "-0.200",
      "price_unit": "USD",
      "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "start_time": "Fri, 18 Oct 2019 17:02:00 +0000",
      "status": "completed",
      "subresource_uris": {
        "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
        "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
        "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
        "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
        "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
        "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
        "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
        "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
        "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json",
        "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/TwimlSessions.json"
      },
      "to": "+13051913581",
      "to_formatted": "(305) 191-3581",
      "trunk_sid": "TKdeadbeefdeadbeefdeadbeefdeadbeef",
      "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
      "queue_time": "1000"
    },
    {
      "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "answered_by": "human",
      "api_version": "2010-04-01",
      "caller_name": "callerid2",
      "date_created": "Fri, 18 Oct 2019 16:00:00 +0000",
      "date_updated": "Fri, 18 Oct 2019 16:01:00 +0000",
      "direction": "inbound",
      "duration": "3",
      "end_time": "Fri, 18 Oct 2019 16:03:00 +0000",
      "forwarded_from": "calledvia2",
      "from": "+13051416798",
      "from_formatted": "(305) 141-6798",
      "group_sid": "GPdeadbeefdeadbeefdeadbeefdeadbeee",
      "parent_call_sid": "CAdeadbeefdeadbeefdeadbeefdeadbeee",
      "phone_number_sid": "PNdeadbeefdeadbeefdeadbeefdeadbeee",
      "price": "-0.100",
      "price_unit": "JPY",
      "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0",
      "start_time": "Fri, 18 Oct 2019 16:02:00 +0000",
      "status": "completed",
      "subresource_uris": {
        "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Notifications.json",
        "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Recordings.json",
        "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Payments.json",
        "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Events.json",
        "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Siprec.json",
        "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Streams.json",
        "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/Transcriptions.json",
        "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/UserDefinedMessageSubscriptions.json",
        "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/UserDefinedMessages.json",
        "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0/TwimlSessions.json"
      },
      "to": "+13051913580",
      "to_formatted": "(305) 191-3580",
      "trunk_sid": "TKdeadbeefdeadbeefdeadbeefdeadbeef",
      "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0.json",
      "queue_time": "1000"
    }
  ],
  "end": 1,
  "first_page_uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=0",
  "next_page_uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=1&PageToken=PACAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0",
  "page": 0,
  "page_size": 2,
  "previous_page_uri": null,
  "start": 0,
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json?Status=completed&To=%2B123456789&From=%2B987654321&StartTime=2008-01-02&ParentCallSid=CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&EndTime=2009-01-02&PageSize=2&Page=0"
}
```

> \[!NOTE]
>
> You can append a `.csv` extension to any resource URI to get CSV (Comma Separated Values) representation. Specifying CSV may be especially useful for call logs. Try this:
>
> ```bash
> GET /2010-04-01/Accounts/{AccountSid}/Calls.csv
> ```
>
> Learn more about [API response formats](/docs/usage/twilios-response).

### Paging

If you are using the Twilio REST API, the list returned to you includes [paging information](/docs/usage/twilios-response#pagination).

If you plan to request more records than will fit on a single page, you can use the provided `nextpageuri` rather than incrementing through pages by page number.

Using `nextpageuri` for paging ensures that your next request will pick up where you left off. This can help keep you from retrieving duplicate data if you are actively making or receiving calls.

> \[!NOTE]
>
> All of the [Twilio SDKs](/docs/libraries) handle paging automatically. You do not need to explicitly request individual pages when using an SDK to fetch lists of resources.

## Update a Call

`POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Calls/{Sid}.json`

Updating a Call allows you to modify an active call.

Real-time call modification allows you to interrupt an in-progress call and terminate it or have it begin processing TwiML from either a new URL or from the TwiML provided with modification. Call modification is useful for any application where you want to change the behavior of a running call asynchronously, e.g., hold music, call queues, transferring calls, or forcing a hangup.

By sending an HTTP `POST` request to a specific Call instance, you can redirect a call that is in progress or you can terminate a call.

> \[!NOTE]
>
> For step-by-step guidance on modifying in-progress calls, check out the tutorial [Modify Calls in Progress](/docs/voice/tutorials/how-to-modify-calls-in-progress) in your web language of choice.

### Path parameters

```json
[{"name":"AccountSid","in":"path","description":"The SID of the [Account](/docs/iam/api/account) that created the Call resource(s) to update.","schema":{"type":"string","minLength":34,"maxLength":34,"pattern":"^AC[0-9a-fA-F]{32}$"},"required":true},{"name":"Sid","in":"path","description":"The Twilio-provided string that uniquely identifies the Call resource to update","schema":{"type":"string","minLength":34,"maxLength":34,"pattern":"^CA[0-9a-fA-F]{32}$"},"required":true}]
```

### Request body parameters

```json
{"schema":{"type":"object","title":"UpdateCallRequest","properties":{"Url":{"type":"string","format":"uri","description":"The absolute URL that returns the TwiML instructions for the call. We will call this URL using the `method` when the call connects. For more information, see the [Url Parameter](/docs/voice/make-calls#specify-a-url-parameter) section in [Making Calls](/docs/voice/make-calls)."},"Method":{"type":"string","format":"http-method","enum":["GET","POST"],"description":"The HTTP method we should use when calling the `url`. Can be: `GET` or `POST` and the default is `POST`. If an `application_sid` parameter is present, this parameter is ignored."},"Status":{"type":"string","enum":["canceled","completed"],"refName":"call_enum_update_status","modelName":"call_enum_update_status"},"FallbackUrl":{"type":"string","format":"uri","description":"The URL that we call using the `fallback_method` if an error occurs when requesting or executing the TwiML at `url`. If an `application_sid` parameter is present, this parameter is ignored."},"FallbackMethod":{"type":"string","format":"http-method","enum":["GET","POST"],"description":"The HTTP method that we should use to request the `fallback_url`. Can be: `GET` or `POST` and the default is `POST`. If an `application_sid` parameter is present, this parameter is ignored."},"StatusCallback":{"type":"string","format":"uri","description":"The URL we should call using the `status_callback_method` to send status information to your application. If no `status_callback_event` is specified, we will send the `completed` status. If an `application_sid` parameter is present, this parameter is ignored. URLs must contain a valid hostname (underscores are not permitted)."},"StatusCallbackMethod":{"type":"string","format":"http-method","enum":["GET","POST"],"description":"The HTTP method we should use when requesting the `status_callback` URL. Can be: `GET` or `POST` and the default is `POST`. If an `application_sid` parameter is present, this parameter is ignored."},"Twiml":{"type":"string","format":"twiml","description":"TwiML instructions for the call Twilio will use without fetching Twiml from url. Twiml and url parameters are mutually exclusive"},"TimeLimit":{"type":"integer","description":"The maximum duration of the call in seconds. Constraints depend on account and configuration."}}},"examples":{"update":{"value":{"lang":"json","value":"{\n  \"FallbackMethod\": \"GET\",\n  \"FallbackUrl\": \"https://example.com\",\n  \"Method\": \"GET\",\n  \"Status\": \"completed\",\n  \"StatusCallback\": \"https://example.com\",\n  \"StatusCallbackUrl\": \"https://example.com\",\n  \"StatusCallbackMethod\": \"GET\",\n  \"Url\": \"https://example.com\"\n}","meta":"","code":"{\n  \"FallbackMethod\": \"GET\",\n  \"FallbackUrl\": \"https://example.com\",\n  \"Method\": \"GET\",\n  \"Status\": \"completed\",\n  \"StatusCallback\": \"https://example.com\",\n  \"StatusCallbackUrl\": \"https://example.com\",\n  \"StatusCallbackMethod\": \"GET\",\n  \"Url\": \"https://example.com\"\n}","tokens":[["{","#C9D1D9"],"\n  ",["\"FallbackMethod\"","#7EE787"],[":","#C9D1D9"]," ",["\"GET\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"FallbackUrl\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://example.com\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Method\"","#7EE787"],[":","#C9D1D9"]," ",["\"GET\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Status\"","#7EE787"],[":","#C9D1D9"]," ",["\"completed\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"StatusCallback\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://example.com\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"StatusCallbackUrl\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://example.com\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"StatusCallbackMethod\"","#7EE787"],[":","#C9D1D9"]," ",["\"GET\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Url\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://example.com\"","#A5D6FF"],"\n",["}","#C9D1D9"]],"annotations":[],"themeName":"github-dark","style":{"color":"#c9d1d9","background":"#0d1117"}}},"cancel":{"value":{"lang":"json","value":"{\n  \"FallbackMethod\": \"GET\",\n  \"FallbackUrl\": \"https://example.com\",\n  \"Method\": \"GET\",\n  \"Status\": \"canceled\",\n  \"StatusCallback\": \"https://example.com\",\n  \"StatusCallbackMethod\": \"GET\",\n  \"Url\": \"https://example.com\"\n}","meta":"","code":"{\n  \"FallbackMethod\": \"GET\",\n  \"FallbackUrl\": \"https://example.com\",\n  \"Method\": \"GET\",\n  \"Status\": \"canceled\",\n  \"StatusCallback\": \"https://example.com\",\n  \"StatusCallbackMethod\": \"GET\",\n  \"Url\": \"https://example.com\"\n}","tokens":[["{","#C9D1D9"],"\n  ",["\"FallbackMethod\"","#7EE787"],[":","#C9D1D9"]," ",["\"GET\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"FallbackUrl\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://example.com\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Method\"","#7EE787"],[":","#C9D1D9"]," ",["\"GET\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Status\"","#7EE787"],[":","#C9D1D9"]," ",["\"canceled\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"StatusCallback\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://example.com\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"StatusCallbackMethod\"","#7EE787"],[":","#C9D1D9"]," ",["\"GET\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Url\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://example.com\"","#A5D6FF"],"\n",["}","#C9D1D9"]],"annotations":[],"themeName":"github-dark","style":{"color":"#c9d1d9","background":"#0d1117"}}},"posttwiml":{"value":{"lang":"json","value":"{\n  \"FallbackMethod\": \"GET\",\n  \"FallbackUrl\": \"https://example.com\",\n  \"Method\": \"GET\",\n  \"Status\": \"canceled\",\n  \"StatusCallback\": \"https://example.com\",\n  \"StatusCallbackMethod\": \"GET\",\n  \"Twiml\": \"<Response><Say>Enjoy</Say></Response>\"\n}","meta":"","code":"{\n  \"FallbackMethod\": \"GET\",\n  \"FallbackUrl\": \"https://example.com\",\n  \"Method\": \"GET\",\n  \"Status\": \"canceled\",\n  \"StatusCallback\": \"https://example.com\",\n  \"StatusCallbackMethod\": \"GET\",\n  \"Twiml\": \"<Response><Say>Enjoy</Say></Response>\"\n}","tokens":[["{","#C9D1D9"],"\n  ",["\"FallbackMethod\"","#7EE787"],[":","#C9D1D9"]," ",["\"GET\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"FallbackUrl\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://example.com\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Method\"","#7EE787"],[":","#C9D1D9"]," ",["\"GET\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Status\"","#7EE787"],[":","#C9D1D9"]," ",["\"canceled\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"StatusCallback\"","#7EE787"],[":","#C9D1D9"]," ",["\"https://example.com\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"StatusCallbackMethod\"","#7EE787"],[":","#C9D1D9"]," ",["\"GET\"","#A5D6FF"],[",","#C9D1D9"],"\n  ",["\"Twiml\"","#7EE787"],[":","#C9D1D9"]," ",["\"<Response><Say>Enjoy</Say></Response>\"","#A5D6FF"],"\n",["}","#C9D1D9"]],"annotations":[],"themeName":"github-dark","style":{"color":"#c9d1d9","background":"#0d1117"}}},"updatetimelimit":{"value":{"lang":"json","value":"{\n  \"TimeLimit\": 600\n}","meta":"","code":"{\n  \"TimeLimit\": 600\n}","tokens":[["{","#C9D1D9"],"\n  ",["\"TimeLimit\"","#7EE787"],[":","#C9D1D9"]," ",["600","#79C0FF"],"\n",["}","#C9D1D9"]],"annotations":[],"themeName":"github-dark","style":{"color":"#c9d1d9","background":"#0d1117"}}}},"encodingType":"application/x-www-form-urlencoded","conditionalParameterMap":{}}
```

Update a Call in progress with TwiML

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function updateCall() {
  const call = await client
    .calls("CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    .update({ twiml: "<Response><Say>Ahoy there</Say></Response>" });

  console.log(call.sid);
}

updateCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

call = client.calls("CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").update(
    twiml="<Response><Say>Ahoy there</Say></Response>"
)

print(call.sid)
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        var call = await CallResource.UpdateAsync(
            twiml: new Twilio.Types.Twiml("<Response><Say>Ahoy there</Say></Response>"),
            pathSid: "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

        Console.WriteLine(call.Sid);
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import com.twilio.type.Twiml;
import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        Call call = Call.updater("CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
                        .setTwiml(new com.twilio.type.Twiml("<Response><Say>Ahoy there</Say></Response>"))
                        .update();

        System.out.println(call.getSid());
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.UpdateCallParams{}
	params.SetTwiml("<Response><Say>Ahoy there</Say></Response>")

	resp, err := client.Api.UpdateCall("CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	} else {
		if resp.Sid != nil {
			fmt.Println(*resp.Sid)
		} else {
			fmt.Println(resp.Sid)
		}
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$call = $twilio
    ->calls("CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    ->update(["twiml" => "<Response><Say>Ahoy there</Say></Response>"]);

print $call->sid;
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

call = @client
       .api
       .v2010
       .calls('CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
       .update(twiml: '<Response><Say>Ahoy there</Say></Response>')

puts call.sid
```

```bash
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:update \
   --sid CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
   --twiml "<Response><Say>Ahoy there</Say></Response>"
```

```bash
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json" \
--data-urlencode "Twiml=<Response><Say>Ahoy there</Say></Response>" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

```json
{
  "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "answered_by": null,
  "api_version": "2010-04-01",
  "caller_name": null,
  "date_created": "Tue, 31 Aug 2010 20:36:28 +0000",
  "date_updated": "Tue, 31 Aug 2010 20:36:44 +0000",
  "direction": "inbound",
  "duration": "15",
  "end_time": "Tue, 31 Aug 2010 20:36:44 +0000",
  "forwarded_from": "+141586753093",
  "from": "+14158675308",
  "from_formatted": "(415) 867-5308",
  "group_sid": null,
  "parent_call_sid": null,
  "phone_number_sid": "PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "price": "-0.03000",
  "price_unit": "USD",
  "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "start_time": "Tue, 31 Aug 2010 20:36:29 +0000",
  "status": "completed",
  "subresource_uris": {
    "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
    "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
    "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
    "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
    "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
    "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
    "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
    "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
    "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json",
    "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/TwimlSessions.json"
  },
  "to": "+14158675309",
  "to_formatted": "(415) 867-5309",
  "trunk_sid": null,
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
  "queue_time": "1000"
}
```

Update a Call in progress with URL

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function updateCall() {
  const call = await client.calls("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").update({
    method: "POST",
    url: "http://demo.twilio.com/docs/voice.xml",
  });

  console.log(call.sid);
}

updateCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

call = client.calls("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").update(
    method="POST", url="http://demo.twilio.com/docs/voice.xml"
)

print(call.sid)
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        var call = await CallResource.UpdateAsync(
            method: Twilio.Http.HttpMethod.Post,
            url: new Uri("http://demo.twilio.com/docs/voice.xml"),
            pathSid: "CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

        Console.WriteLine(call.Sid);
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import java.net.URI;
import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;
import com.twilio.http.HttpMethod;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        Call call = Call.updater("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX")
                        .setMethod(HttpMethod.POST)
                        .setUrl(URI.create("http://demo.twilio.com/docs/voice.xml"))
                        .update();

        System.out.println(call.getSid());
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.UpdateCallParams{}
	params.SetMethod("POST")
	params.SetUrl("http://demo.twilio.com/docs/voice.xml")

	resp, err := client.Api.UpdateCall("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
		params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	} else {
		if resp.Sid != nil {
			fmt.Println(*resp.Sid)
		} else {
			fmt.Println(resp.Sid)
		}
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$call = $twilio->calls("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX")->update([
    "method" => "POST",
    "url" => "http://demo.twilio.com/docs/voice.xml",
]);

print $call->sid;
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

call = @client
       .api
       .v2010
       .calls('CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')
       .update(
         method: 'POST',
         url: 'http://demo.twilio.com/docs/voice.xml'
       )

puts call.sid
```

```bash
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:update \
   --sid CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX \
   --method POST \
   --url http://demo.twilio.com/docs/voice.xml
```

```bash
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls/CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.json" \
--data-urlencode "Method=POST" \
--data-urlencode "Url=http://demo.twilio.com/docs/voice.xml" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

```json
{
  "account_sid": "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "answered_by": null,
  "api_version": "2010-04-01",
  "caller_name": null,
  "date_created": "Tue, 31 Aug 2010 20:36:28 +0000",
  "date_updated": "Tue, 31 Aug 2010 20:36:44 +0000",
  "direction": "inbound",
  "duration": "15",
  "end_time": "Tue, 31 Aug 2010 20:36:44 +0000",
  "forwarded_from": "+141586753093",
  "from": "+14158675308",
  "from_formatted": "(415) 867-5308",
  "group_sid": null,
  "parent_call_sid": null,
  "phone_number_sid": "PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "price": "-0.03000",
  "price_unit": "USD",
  "sid": "CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "start_time": "Tue, 31 Aug 2010 20:36:29 +0000",
  "status": "completed",
  "subresource_uris": {
    "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
    "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
    "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
    "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
    "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
    "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
    "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
    "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
    "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json",
    "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/TwimlSessions.json"
  },
  "to": "+14158675309",
  "to_formatted": "(415) 867-5309",
  "trunk_sid": null,
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
  "queue_time": "1000"
}
```

Update a Call: End the call

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function updateCall() {
  const call = await client
    .calls("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX")
    .update({ status: "completed" });

  console.log(call.sid);
}

updateCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

call = client.calls("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").update(
    status="completed"
)

print(call.sid)
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        var call = await CallResource.UpdateAsync(
            status: CallResource.UpdateStatusEnum.Completed,
            pathSid: "CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

        Console.WriteLine(call.Sid);
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        Call call = Call.updater("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").setStatus(Call.UpdateStatus.COMPLETED).update();

        System.out.println(call.getSid());
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.UpdateCallParams{}
	params.SetStatus("completed")

	resp, err := client.Api.UpdateCall("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
		params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	} else {
		if resp.Sid != nil {
			fmt.Println(*resp.Sid)
		} else {
			fmt.Println(resp.Sid)
		}
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$call = $twilio
    ->calls("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX")
    ->update(["status" => "completed"]);

print $call->sid;
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

call = @client
       .api
       .v2010
       .calls('CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')
       .update(status: 'completed')

puts call.sid
```

```bash
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:update \
   --sid CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX \
   --status completed
```

```bash
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls/CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.json" \
--data-urlencode "Status=completed" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

```json
{
  "account_sid": "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "answered_by": null,
  "api_version": "2010-04-01",
  "caller_name": null,
  "date_created": "Tue, 31 Aug 2010 20:36:28 +0000",
  "date_updated": "Tue, 31 Aug 2010 20:36:44 +0000",
  "direction": "inbound",
  "duration": "15",
  "end_time": "Tue, 31 Aug 2010 20:36:44 +0000",
  "forwarded_from": "+141586753093",
  "from": "+14158675308",
  "from_formatted": "(415) 867-5308",
  "group_sid": null,
  "parent_call_sid": null,
  "phone_number_sid": "PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "price": "-0.03000",
  "price_unit": "USD",
  "sid": "CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "start_time": "Tue, 31 Aug 2010 20:36:29 +0000",
  "status": "completed",
  "subresource_uris": {
    "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
    "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
    "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
    "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
    "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
    "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
    "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
    "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
    "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json",
    "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/TwimlSessions.json"
  },
  "to": "+14158675309",
  "to_formatted": "(415) 867-5309",
  "trunk_sid": null,
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
  "queue_time": "1000"
}
```

When you redirect an active call to another phone number, Twilio creates an entirely new Call instance for that new phone number. The original call is the **parent call**, and any additional number dialed establishes a **child call**. Parent and child calls will have uniquely identifying Call SIDs.

Note that any parent call currently executing a [\<Dial>](/docs/voice/twiml/dial) is considered in-progress by Twilio. Even if you've re-directed your initial call to a new number, the parent call is still active, and thus you must use`Status=completed` to end it.

Update the StatusCallback of an active Call

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function updateCall() {
  const call = await client.calls("CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").update({
    statusCallback: "https://example.com/status-changed",
    url: "https://example.com/twiml",
  });

  console.log(call.sid);
}

updateCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

call = client.calls("CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").update(
    url="https://example.com/twiml",
    status_callback="https://example.com/status-changed",
)

print(call.sid)
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        var call = await CallResource.UpdateAsync(
            url: new Uri("https://example.com/twiml"),
            statusCallback: new Uri("https://example.com/status-changed"),
            pathSid: "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

        Console.WriteLine(call.Sid);
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import java.net.URI;
import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        Call call = Call.updater("CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
                        .setUrl(URI.create("https://example.com/twiml"))
                        .setStatusCallback(URI.create("https://example.com/status-changed"))
                        .update();

        System.out.println(call.getSid());
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.UpdateCallParams{}
	params.SetUrl("https://example.com/twiml")
	params.SetStatusCallback("https://example.com/status-changed")

	resp, err := client.Api.UpdateCall("CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	} else {
		if resp.Sid != nil {
			fmt.Println(*resp.Sid)
		} else {
			fmt.Println(resp.Sid)
		}
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$call = $twilio->calls("CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")->update([
    "url" => "https://example.com/twiml",
    "statusCallback" => "https://example.com/status-changed",
]);

print $call->sid;
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

call = @client
       .api
       .v2010
       .calls('CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
       .update(
         url: 'https://example.com/twiml',
         status_callback: 'https://example.com/status-changed'
       )

puts call.sid
```

```bash
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:update \
   --sid CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
   --url https://example.com/twiml \
   --status-callback https://example.com/status-changed
```

```bash
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json" \
--data-urlencode "Url=https://example.com/twiml" \
--data-urlencode "StatusCallback=https://example.com/status-changed" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

```json
{
  "account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "answered_by": null,
  "api_version": "2010-04-01",
  "caller_name": null,
  "date_created": "Tue, 31 Aug 2010 20:36:28 +0000",
  "date_updated": "Tue, 31 Aug 2010 20:36:44 +0000",
  "direction": "inbound",
  "duration": "15",
  "end_time": "Tue, 31 Aug 2010 20:36:44 +0000",
  "forwarded_from": "+141586753093",
  "from": "+14158675308",
  "from_formatted": "(415) 867-5308",
  "group_sid": null,
  "parent_call_sid": null,
  "phone_number_sid": "PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "price": "-0.03000",
  "price_unit": "USD",
  "sid": "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "start_time": "Tue, 31 Aug 2010 20:36:29 +0000",
  "status": "completed",
  "subresource_uris": {
    "notifications": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Notifications.json",
    "recordings": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Recordings.json",
    "payments": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Payments.json",
    "events": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Events.json",
    "siprec": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Siprec.json",
    "streams": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Streams.json",
    "transcriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Transcriptions.json",
    "user_defined_message_subscriptions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessageSubscriptions.json",
    "user_defined_messages": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/UserDefinedMessages.json",
    "twiml_sessions": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/TwimlSessions.json"
  },
  "to": "+14158675309",
  "to_formatted": "(415) 867-5309",
  "trunk_sid": null,
  "uri": "/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
  "queue_time": "1000"
}
```

> \[!WARNING]
>
> To update a `StatusCallback` on a Call, it is required to set the `Url` in the same statement.

## Delete a Call

`DELETE https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Calls/{Sid}.json`

This will delete a call record from your account. Once the record is deleted, it will no longer appear in the API and Account Portal logs.

If successful, this `DELETE` returns an HTTP 204 (No Content) with no body.

`DELETE` on a call record will also delete any associated [call events](/docs/voice/api/call-event-resource), but will not delete associated [recordings](/docs/voice/api/recording) and [transcription](/docs/voice/api/recording-transcription) records.

> \[!WARNING]
>
> Note that an error will occur if you attempt to remove a call record for a call that is actively in progress.

### Path parameters

```json
[{"name":"AccountSid","in":"path","description":"The SID of the [Account](/docs/iam/api/account) that created the Call resource(s) to delete.","schema":{"type":"string","minLength":34,"maxLength":34,"pattern":"^AC[0-9a-fA-F]{32}$"},"required":true},{"name":"Sid","in":"path","description":"The Twilio-provided Call SID that uniquely identifies the Call resource to delete","schema":{"type":"string","minLength":34,"maxLength":34,"pattern":"^CA[0-9a-fA-F]{32}$"},"required":true}]
```

> \[!CAUTION]
>
> **Note:** For calls less than 13 months old, resources deleted from this endpoint will also be deleted in Log Archives. Calls older than 13 months can *only* be deleted via the Bulk Export API.

Delete a Call resource

```js
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function deleteCall() {
  await client.calls("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").remove();
}

deleteCall();
```

```python
# Download the helper library from https://www.twilio.com/docs/python/install
import os
from twilio.rest import Client

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = os.environ["TWILIO_ACCOUNT_SID"]
auth_token = os.environ["TWILIO_AUTH_TOKEN"]
client = Client(account_sid, auth_token)

client.calls("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").delete()
```

```csharp
// Install the C# / .NET helper library from twilio.com/docs/csharp/install

using System;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using System.Threading.Tasks;

class Program {
    public static async Task Main(string[] args) {
        // Find your Account SID and Auth Token at twilio.com/console
        // and set the environment variables. See http://twil.io/secure
        string accountSid = Environment.GetEnvironmentVariable("TWILIO_ACCOUNT_SID");
        string authToken = Environment.GetEnvironmentVariable("TWILIO_AUTH_TOKEN");

        TwilioClient.Init(accountSid, authToken);

        await CallResource.DeleteAsync(pathSid: "CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
    }
}
```

```java
// Install the Java helper library from twilio.com/docs/java/install

import com.twilio.Twilio;
import com.twilio.rest.api.v2010.account.Call;

public class Example {
    // Find your Account SID and Auth Token at twilio.com/console
    // and set the environment variables. See http://twil.io/secure
    public static final String ACCOUNT_SID = System.getenv("TWILIO_ACCOUNT_SID");
    public static final String AUTH_TOKEN = System.getenv("TWILIO_AUTH_TOKEN");

    public static void main(String[] args) {
        Twilio.init(ACCOUNT_SID, AUTH_TOKEN);
        Call.deleter("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX").delete();
    }
}
```

```go
// Download the helper library from https://www.twilio.com/docs/go/install
package main

import (
	"fmt"
	"github.com/twilio/twilio-go"
	api "github.com/twilio/twilio-go/rest/api/v2010"
	"os"
)

func main() {
	// Find your Account SID and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	// Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN exists in your environment
	client := twilio.NewRestClient()

	params := &api.DeleteCallParams{}

	err := client.Api.DeleteCall("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
		params)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	}
}
```

```php
<?php

// Update the path below to your autoload.php,
// see https://getcomposer.org/doc/01-basic-usage.md
require_once "/path/to/vendor/autoload.php";

use Twilio\Rest\Client;

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
$sid = getenv("TWILIO_ACCOUNT_SID");
$token = getenv("TWILIO_AUTH_TOKEN");
$twilio = new Client($sid, $token);

$twilio->calls("CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX")->delete();
```

```ruby
# Download the helper library from https://www.twilio.com/docs/ruby/install
require 'rubygems'
require 'twilio-ruby'

# Find your Account SID and Auth Token at twilio.com/console
# and set the environment variables. See http://twil.io/secure
account_sid = ENV['TWILIO_ACCOUNT_SID']
auth_token = ENV['TWILIO_AUTH_TOKEN']
@client = Twilio::REST::Client.new(account_sid, auth_token)

@client
  .api
  .v2010
  .calls('CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')
  .delete
```

```bash
# Install the twilio-cli from https://twil.io/cli

twilio api:core:calls:remove \
   --sid CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

```bash
curl -X DELETE "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls/CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.json" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
```

## Call resource retention

You are able to retrieve resources via `GET` to the `/Calls` endpoint for 13 months after the resource is created. Records older than thirteen months can only be retrieved via Bulk Export.

We provide a Bulk Export utility in [Console](https://www.twilio.com/console/voice/settings/calls-archives) and via [API](/docs/usage/bulkexport). Bulk Export will generate S3 files containing one day of data per file and deliver the download link via webhook, email, or Console.

## What's next?

Explore [Voice Insights](/docs/voice/voice-insights) with its [Call Insights Event Stream](/docs/voice/voice-insights/event-streams/call-insights-events) and [Call Insights REST API](/docs/voice/voice-insights/api/call) which allow you to see call parameters, investigate call metrics and event timelines, and understand detected quality issues.


## TwiML Reference

# TwiML™ for Programmable Voice

## What is TwiML?

TwiML (*the Twilio Markup Language*) is a set of instructions you can use to tell Twilio what to do when you receive an incoming call or SMS.

### How TwiML works

When someone makes a call to one of your Twilio numbers, Twilio looks up the URL associated with that phone number and sends it a request. Twilio then reads the TwiML instructions hosted at that URL to determine what to do, whether it's recording the call, playing a message for the caller, or prompting the caller to press digits on their keypad.

At its core, TwiML is an [XML](https://en.wikipedia.org/wiki/XML) document with special tags defined by Twilio to help you build your Programmable Voice application.

> \[!NOTE]
>
> Not making phone calls? TwiML powers more than just Twilio Programmable Voice. For instance, check out the documentation on how to use TwiML with [Programmable SMS](/docs/messaging/twiml).

The following will say "Hello, world!" when someone dials a Twilio number configured with this TwiML:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Hello, world!</Say>
</Response>
```

You can always return raw TwiML from your language of choice, or leverage [the Twilio SDKs](/docs/libraries) to automatically create valid TwiML for you. In the code sample below, toggle to your preferred web programming language to see how the above TwiML looks using the SDK.

\`\<Say>\` 'Hello' to an inbound caller

```js
const VoiceResponse = require('twilio').twiml.VoiceResponse;

const response = new VoiceResponse();
response.say('Hello!');

console.log(response.toString());
```

```py
from twilio.twiml.voice_response import VoiceResponse, Say

response = VoiceResponse()
response.say('Hello!')

print(response)
```

```cs
using System;
using Twilio.TwiML;
using Twilio.TwiML.Voice;


class Example
{
    static void Main()
    {
        var response = new VoiceResponse();
        response.Say("Hello!");

        Console.WriteLine(response.ToString());
    }
}
```

```java
import com.twilio.twiml.VoiceResponse;
import com.twilio.twiml.voice.Say;
import com.twilio.twiml.TwiMLException;


public class Example {
    public static void main(String[] args) {
        Say say = new Say.Builder("Hello!").build();
        VoiceResponse response = new VoiceResponse.Builder().say(say).build();

        try {
            System.out.println(response.toXml());
        } catch (TwiMLException e) {
            e.printStackTrace();
        }
    }
}
```

```go
package main

import (
	"fmt"

	"github.com/twilio/twilio-go/twiml"
)

func main() {
	twiml, _ := twiml.Voice([]twiml.Element{
		&twiml.VoiceSay{
			Message: "Hello!",
		},
	})

	fmt.Print(twiml)
}
```

```php
<?php
require_once './vendor/autoload.php';
use Twilio\TwiML\VoiceResponse;

$response = new VoiceResponse();
$response->say('Hello!');

echo $response;
```

```rb
require 'twilio-ruby'

response = Twilio::TwiML::VoiceResponse.new
response.say(message: 'Hello!')

puts response
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hello!</Say>
</Response>
```

> \[!NOTE]
>
> Check out our [short tutorial on responding to incoming phone calls](/docs/voice/tutorials/how-to-respond-to-incoming-phone-calls), available in our six supported SDK languages. You can also leverage Twilio's [TwiML bins](https://www.twilio.com/console/runtime/twiml-bins), our serverless solution that lets you write TwiML that Twilio will host for you so you can quickly prototype a solution without spinning up a web server.

Outbound calls (calls from a Twilio number to an outside number) are controlled using TwiML in the same manner. When you initiate an outbound call with the Twilio API, Twilio then requests your TwiML to learn how to handle the call.

Twilio executes just one TwiML document to the caller at a time, but many TwiML documents can be linked together to build complex interactive voice applications.

### TwiML elements

In TwiML parlance, XML elements are divided into three groups: the root `<Response>` element, **[verbs](/docs/voice/twiml#twiml-verbs-for-programmable-voice)**, and **[nouns](/docs/voice/twiml#twiml-nouns)**.

> \[!WARNING]
>
> TwiML elements (**verbs** and **nouns**) have case-sensitive names. For example, using `<say>` instead of `<Say>` will result in an error. Attribute names are also case sensitive and camelCased.

You can use XML comments freely in your TwiML; the interpreter ignores them.

#### The `<Response>` element

In any TwiML response to a Twilio request, you must nest all verb elements within `<Response>`, the root element of Twilio's XML markup:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>
      This message must be nested in a Response element
      in order for Twilio to say it to your caller.
    </Say>
</Response>
```

Any other structure is considered invalid.

#### TwiML verbs for Programmable Voice

TwiML **verbs** tell Twilio what *actions* to take on a given call. Because of this, most elements in a TwiML document are TwiML verbs. Verb names are case sensitive, as are their attribute names.

You can use different combinations of TwiML verbs to create all kinds of interactive voice applications. The core TwiML verbs for Programmable Voice are:

* [`<Say>`](/docs/voice/twiml/say) — Read text to the caller
* [`<Play>`](/docs/voice/twiml/play) — Play an audio file for the caller
* [`<Dial>`](/docs/voice/twiml/dial) — Add another party to the call
* [`<Record>`](/docs/voice/twiml/record) — Record the caller's voice
* [`<Gather>`](/docs/voice/twiml/gather) — Collect digits the caller types on their keypad

The following verbs may be used to control the flow of your call:

* [`<Hangup>`](/docs/voice/twiml/hangup) — Hang up the call.
* [`<Enqueue>`](/docs/voice/twiml/enqueue) — Add the caller to a queue of callers.
* [`<Leave>`](/docs/voice/twiml/leave) — Remove a caller from a queue of callers.
* [`<Pause>`](/docs/voice/twiml/pause) — Wait before executing more instructions.
* [`<Redirect>`](/docs/voice/twiml/redirect) — Redirect call flow to a different TwiML document.
* [`<Refer>`](/docs/voice/twiml/refer) — Twilio initiates SIP REFER towards IP communication infrastructure.
* [`<Reject>`](/docs/voice/twiml/reject) — Decline an incoming call without being billed.

The following nouns provide advanced capabilities:

* `<VirtualAgent>` — Build AI-powered Conversational IVR.

> \[!WARNING]
>
> There are certain situations when the TwiML interpreter may not reach verbs in a TwiML document because control flow has passed to a different document. This usually happens when a verb's **action** attribute is set.

For example, if a `<Say>` verb is followed by a `<Redirect>` and then another `<Say>`, the second `<Say>` is unreachable because `<Redirect>` transfers full control of a call to the TwiML at a different URL.

#### TwiML nouns

A TwiML **noun** describes the phone numbers and API resources you want to take action on. Effectively, a TwiML noun is anything nested inside a verb that is not itself a verb: it's whatever the verb is acting on.

TwiML nouns are usually just text. However, as in the case of [`<Dial>`](/docs/voice/twiml/dial) with its [`<Number>`](/docs/voice/twiml/number) and [`<Conference>`](/docs/voice/twiml/conference) nouns, at times there are nested XML elements that are nouns.

## Twilio's request to your application

When someone makes an inbound call to one of your Twilio phone numbers, Twilio needs to request TwiML from your application to get instructions for handling the call.

You can configure your Twilio phone number to point to your application's URL by visiting the [phone numbers section of the Console](https://www.twilio.com/console/phone-numbers/). Select your phone number, then scroll to the **Voice & Fax** section to set a webhook, TwiML bin, or Twilio Function for Twilio to send that HTTP request when a call comes in:

![Webhook configuration for incoming voice calls with URL and HTTP GET method.](https://docs-resources.prod.twilio.com/035545f19d41672e4d568ca3c423b8fb79bdaa6a21db6fcfdc38c0ab2421f2a6.png)

Twilio makes its request over HTTP, either as a `GET` or `POST`, just like requesting a web page in your browser or submitting a form.

> \[!WARNING]
>
> Twilio cannot cache `POST`s. If you want Twilio to cache static TwiML pages, then have Twilio make requests to your application using `GET`.

By including parameters and values in its request, Twilio sends data to your application that you can act upon before responding.

### Request parameters

Twilio *always* sends the following parameters when it sends a request to your application to retrieve instructions for how to handle a call.

These will send as either `POST` parameters or URL query parameters, depending on which HTTP method you've configured.

| Parameter       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CallSid`       | A unique identifier for this call, generated by Twilio.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `AccountSid`    | Your Twilio account ID. It is 34 characters long, and always starts with the letters `AC`.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `From`          | The phone number or client identifier of the party that initiated the call. Phone numbers are formatted with a '+' and country code, e.g., `+16175551212` ([E.164](/docs/glossary/what-e164) format). Client identifiers begin with the `client:` URI scheme; for example, on a call from a client named 'charlie', the `From` parameter will be `client:charlie`. If a caller ID is withheld or otherwise unavailable, you may receive a string that contains `anonymous`, `unknown`, or other descriptions. |
| `To`            | The phone number or client identifier of the called party. Phone numbers are formatted with a '+' and country code, e.g., `+16175551212`([E.164](/docs/glossary/what-e164) format). Client identifiers begin with the `client:` URI scheme; for example, for a call to a client named 'joey', the `To` parameter will be `client:joey`.                                                                                                                                                                       |
| `CallStatus`    | A descriptive status for the call. The value is one of the following: `queued`, `ringing`, `in-progress`, `completed`, `busy`, `failed` or `no-answer`. See the [CallStatus section](/docs/voice/twiml#callstatus-values) below for more details.                                                                                                                                                                                                                                                             |
| `ApiVersion`    | The version of the Twilio API used to handle this call. For incoming calls, this is determined by the API version set on the called number. For outgoing calls, this is the version used by the REST API request from the outgoing call.                                                                                                                                                                                                                                                                      |
| `Direction`     | A string describing the direction of the call: `inbound` for inbound calls `outbound-api` for calls initiated via the REST API `outbound-dial` for calls initiated by a `<Dial>` verb.                                                                                                                                                                                                                                                                                                                        |
| `ForwardedFrom` | This parameter is set only when Twilio receives a forwarded call, but its value depends on the caller's carrier including information when forwarding. Not all carriers support passing this information.                                                                                                                                                                                                                                                                                                     |
| `CallerName`    | This parameter is set when the IncomingPhoneNumber that received the call has had its [`VoiceCallerIdLookup`](/docs/phone-numbers/api/incomingphonenumber-resource) value set to `true`. Learn about [Lookup pricing](https://www.twilio.com/en-us/user-authentication-identity/pricing/lookup).                                                                                                                                                                                                              |
| `ParentCallSid` | A unique identifier for the call that created this leg. This parameter is not passed if this is the first leg of a call.                                                                                                                                                                                                                                                                                                                                                                                      |
| `CallToken`     | A token string needed to invoke a forwarded call.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Twilio also attempts to look up geographic data based on the `To` and `From` phone numbers. If available, Twilio will send the following parameters with its request:

| Parameter     | Description                               |
| ------------- | ----------------------------------------- |
| `FromCity`    | The city of the caller                    |
| `FromState`   | The state or province of the caller       |
| `FromZip`     | The postal code of the caller             |
| `FromCountry` | The country of the caller                 |
| `ToCity`      | The city of the called party              |
| `ToState`     | The state or province of the called party |
| `ToZip`       | The postal code of the called party       |
| `ToCountry`   | The country of the called party           |

Twilio will provide the parameters listed above when it makes a request to your application to retrieve instructions for how to handle a call. This might occur when an inbound call comes to your Twilio number, or after a TwiML verb has completed and you've provided an `action` URL where Twilio can retrieve the next set of instructions. Depending on what is happening on a call, other variables may also be sent.

For example, when Twilio receives SIP, it will send additional parameters to your web application: you'll find the list of parameters sent with SIP in our guide **[SIP and TwiML Interaction](/docs/voice/api/sip-twiml)**.

> \[!NOTE]
>
> There are some instances in which Twilio will send a request that doesn't contain all of the above parameters. For example, if you have provided a `statusCallback` URL in a TwiML noun such as [`<VirtualAgent>`](/docs/voice/twiml/connect/virtualagent) or [`<Pay>`](/docs/voice/twiml/pay), Twilio's request to your application will not contain all of the parameters listed above, as they might not all be relevant for the particular status callback. In those instances, you can find the expected parameters in the specific TwiML verb's documentation.

#### `CallStatus` values

The following are the possible values for the `CallStatus` parameter. These values also apply to the `DialCallStatus` parameter, which is sent with HTTP requests to a [`<Dial>`](/docs/voice/twiml/dial) action URL.

| Status        | Description                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `queued`      | The call is ready and waiting in line before going out.                                           |
| `ringing`     | The call is currently ringing.                                                                    |
| `in-progress` | The call was answered and is actively in progress.                                                |
| `completed`   | The call was answered and has ended normally.                                                     |
| `busy`        | The caller received a busy signal.                                                                |
| `failed`      | The call could not be completed as dialed, most likely because the phone number was non-existent. |
| `no-answer`   | The call ended without being answered.                                                            |
| `canceled`    | The call was canceled via the REST API while queued or ringing.                                   |

### Ending the call: callback requests

After receiving a call, requesting TwiML from your app, processing it, and finally ending the call, Twilio will make an asynchronous HTTP request to the `StatusCallback` URL configured for the Twilio number that was called.

You need to explicitly provide this URL to your application in the `StatusCallback` parameter of each message for which you want the status callbacks. The raw TwiML for this looks like:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial>
        <Number
         statusCallbackEvent="initiated ringing answered completed"
         statusCallback="https://myapp.com/calls/events"
         statusCallbackMethod="POST">
            +12316851234
        </Number>
    </Dial>
</Response>
```

The code sample below shows how to set your status callback URL with plain TwiML or using the SDK of your choice:

Set a StatusCallback

```js
const VoiceResponse = require('twilio').twiml.VoiceResponse;


const response = new VoiceResponse();
const dial = response.dial();
dial.number({
    statusCallbackEvent: 'initiated ringing answered completed',
    statusCallback: 'https://myapp.com/calls/events',
    statusCallbackMethod: 'POST'
}, '+12349013030');

console.log(response.toString());
```

```py
from twilio.twiml.voice_response import Dial, Number, VoiceResponse

response = VoiceResponse()
dial = Dial()
dial.number(
    '+12349013030',
    status_callback_event='initiated ringing answered completed',
    status_callback='https://myapp.com/calls/events',
    status_callback_method='POST'
)
response.append(dial)

print(response)
```

```cs
using System;
using Twilio.TwiML;
using Twilio.TwiML.Voice;
using System.Linq;

class Example
{
    static void Main()
    {
        var response = new VoiceResponse();
        var dial = new Dial();
        dial.Number("+12349013030", statusCallbackEvent: new []{Number
            .EventEnum.Initiated, Number.EventEnum.Ringing, Number.EventEnum
            .Answered, Number.EventEnum.Completed}.ToList(),
            statusCallback: new Uri("https://myapp.com/calls/events"),
            statusCallbackMethod: Twilio.Http.HttpMethod.Post);
        response.Append(dial);

        Console.WriteLine(response.ToString());
    }
}
```

```java
import com.twilio.twiml.voice.Dial;
import com.twilio.twiml.voice.Number;
import com.twilio.twiml.VoiceResponse;
import com.twilio.twiml.TwiMLException;
import java.util.Arrays;
import com.twilio.http.HttpMethod;

public class Example {
    public static void main(String[] args) {
        Number number = new Number.Builder("+12349013030")
            .statusCallback("https://myapp.com/calls/events")
            .statusCallbackMethod(HttpMethod.POST).statusCallbackEvents(Arrays
            .asList(Number.Event.INITIATED, Number.Event.RINGING, Number.Event
            .ANSWERED, Number.Event.COMPLETED)).build();
        Dial dial = new Dial.Builder().number(number).build();
        VoiceResponse response = new VoiceResponse.Builder().dial(dial).build();

        try {
            System.out.println(response.toXml());
        } catch (TwiMLException e) {
            e.printStackTrace();
        }
    }
}
```

```go
package main

import (
	"fmt"

	"github.com/twilio/twilio-go/twiml"
)

func main() {
	twiml, _ := twiml.Voice([]twiml.Element{
		&twiml.VoiceDial{
			InnerElements: []twiml.Element{
				&twiml.VoiceNumber{
					PhoneNumber:          "+12349013030",
					StatusCallbackEvent:  "initiated ringing answered completed",
					StatusCallback:       "https://myapp.com/calls/events",
					StatusCallbackMethod: "POST",
				},
			},
		},
	})

	fmt.Print(twiml)
}
```

```php
<?php
require_once './vendor/autoload.php';
use Twilio\TwiML\VoiceResponse;

$response = new VoiceResponse();
$dial = $response->dial('');
$dial->number('+12349013030',
    ['statusCallbackEvent' => 'initiated ringing answered completed',
    'statusCallback' => 'https://myapp.com/calls/events',
    'statusCallbackMethod' => 'POST']);

echo $response;
```

```rb
require 'twilio-ruby'

response = Twilio::TwiML::VoiceResponse.new
response.dial do |dial|
  dial.number('+12349013030',
              status_callback_event: 'initiated ringing answered completed',
              status_callback: 'https://myapp.com/calls/events',
              status_callback_method: 'POST')
end

puts response
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial>
        <Number
         statusCallbackEvent="initiated ringing answered completed"
         statusCallback="https://myapp.com/calls/events"
         statusCallbackMethod="POST">
            +12349013030
        </Number>
    </Dial>
</Response>
```

By providing a `StatusCallback` URL for your Twilio number and capturing this request, you can determine when a call ends and receive information about the call. Non-relative URLs must contain a valid hostname, and underscores are not permitted.

#### `StatusCallback` request parameters

When Twilio sends parameters to your application in an asynchronous request to the `StatusCallback` URL, they include the same [parameters passed in a synchronous TwiML request](/docs/voice/twiml#request-parameters).

The status callback request also passes these additional parameters:

| Parameter           | Description                                                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CallDuration`      | The duration in seconds of the just-completed call.                                                                                                                                     |
| `RecordingUrl`      | The URL of the phone call's recorded audio. This parameter is included only if Record=true is set on the REST API request, and does not include recordings from `<Dial>` or `<Record>`. |
| `RecordingSid`      | The unique id of the [Recording](/docs/voice/api/recording) from this call.                                                                                                             |
| `RecordingDuration` | The duration of the recorded audio (in seconds).                                                                                                                                        |

### Data formats

#### Phone numbers

All phone numbers in requests from Twilio are in [E.164](/docs/glossary/what-e164) format if possible. For example, (231) 685-1234 would come through as '+12316851234'. However, there are occasionally cases where Twilio cannot normalize an incoming caller ID to E.164. In these situations, Twilio will report the raw caller ID string.

#### Dates and times

All dates and times in requests from Twilio are GMT in [RFC 2822](https://www.ietf.org/rfc/rfc2822.txt) format. For example, 6:13 PM PDT on August 19th, 2010 would be 'Fri, 20 Aug 2010 01:13:42 +0000'.

#### Twilio is a well-behaved HTTP client

Twilio behaves just like a web browser when making HTTP requests to URLs:

* **Cookies**: Twilio accepts HTTP cookies and will include them in each request, just like a normal web browser.
* **Redirects**: Twilio follows HTTP Redirects (HTTP status codes 301, 307, etc.), just like a normal web browser. Twilio supports a maximum of 10 redirects before failing the request with error code [11215](/docs/api/errors/11215).
* **Caching**: Twilio will cache files when HTTP headers allow it (via ETag and Last-Modified headers) and when the HTTP method is `GET`, just like a normal web browser.

#### Twilio understands MIME types

Twilio does the right thing when your application responds with different MIME types:

| MIME Type                                  | Behavior                                                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text/xml`, `application/xml`, `text/html` | Twilio interprets the returned document as an XML Instruction Set (which we like to call TwiML). This is the most commonly used response.                            |
| Various audio types                        | Twilio plays the audio file to the caller, and then hangs up. See the [`<Play>`](/docs/voice/twiml/play) documentation for supported MIME types.                     |
| `text/plain`                               | If the response is valid TwiML, we will execute the provided instructions, otherwise Twilio reads the content of the text out loud to the caller, and then hangs up. |

## Responding to Twilio

In your response to [Twilio's request](/docs/voice/twiml#twilios-request-to-your-application) to your configured URL, you can tell Twilio what to do on a call.

### How the TwiML interpreter works

When your application responds to a Twilio request with XML, Twilio runs your document through the TwiML interpreter. The TwiML interpreter only understands the few specially-named [XML elements that make up TwiML](/docs/voice/twiml#twiml-elements): [`<Response>`](/docs/voice/twiml#the-response-element) [verbs](/docs/voice/twiml#twiml-verbs-for-programmable-voice), and [nouns](/docs/voice/twiml#twiml-nouns).

The interpreter starts at the top of your TwiML document and executes instructions (verbs) in order from top to bottom.

The following code snippet reads "Hello World" to the caller before playing `Cowbell.mp3` for the caller and then hanging up.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Hello, World!</Say>
    <Play>https://api.twilio.com/Cowbell.mp3</Play>
</Response>
```

Just as with all TwiML, you can use the SDKs to help you play some music to a caller. Include the `loop` attribute to tell Twilio to loop this recording 10 times (or until the caller hangs up):

Play and loop some music for your callers

```js
const VoiceResponse = require('twilio').twiml.VoiceResponse;


const response = new VoiceResponse();
response.play({
    loop: 10
}, 'https://api.twilio.com/cowbell.mp3');

console.log(response.toString());
```

```py
from twilio.twiml.voice_response import Play, VoiceResponse

response = VoiceResponse()
response.play('https://api.twilio.com/cowbell.mp3', loop=10)

print(response)
```

```cs
using System;
using Twilio.TwiML;
using Twilio.TwiML.Voice;


class Example
{
    static void Main()
    {
        var response = new VoiceResponse();
        response.Play(new Uri("https://api.twilio.com/cowbell.mp3"), loop: 10);

        Console.WriteLine(response.ToString());
    }
}
```

```java
import com.twilio.twiml.voice.Play;
import com.twilio.twiml.VoiceResponse;
import com.twilio.twiml.TwiMLException;


public class Example {
    public static void main(String[] args) {
        Play play = new Play.Builder("https://api.twilio.com/cowbell.mp3")
            .loop(10).build();
        VoiceResponse response = new VoiceResponse.Builder().play(play).build();

        try {
            System.out.println(response.toXml());
        } catch (TwiMLException e) {
            e.printStackTrace();
        }
    }
}
```

```go
package main

import (
	"fmt"

	"github.com/twilio/twilio-go/twiml"
)

func main() {
	twiml, _ := twiml.Voice([]twiml.Element{
		&twiml.VoicePlay{
			Loop: "10",
			Url:  "https://api.twilio.com/cowbell.mp3",
		},
	})

	fmt.Print(twiml)
}
```

```php
<?php
require_once './vendor/autoload.php';
use Twilio\TwiML\VoiceResponse;

$response = new VoiceResponse();
$response->play('https://api.twilio.com/cowbell.mp3', ['loop' => 10]);

echo $response;
```

```rb
require 'twilio-ruby'

response = Twilio::TwiML::VoiceResponse.new
response.play(loop: 10, url: 'https://api.twilio.com/cowbell.mp3')

puts response
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Play loop="10">https://api.twilio.com/cowbell.mp3</Play>
</Response>
```

### Status callbacks in your response

Status callbacks do not control call flow, so TwiML does not need to be returned. If you do respond, use status code `204 No Content` or `200 OK` with `Content-Type: text/xml` and an empty `<Response/>` in the body. Not responding properly will result in warnings in Debugger.

### What's next?

Go in-depth to learn more about the various TwiML verbs you'll use with Twilio's Programmable Voice, such as [`<Dial>`](/docs/voice/twiml/dial) to connect a call or [`<Gather>`](/docs/voice/twiml/gather) for speech recognition and collecting user key presses. You'll find all in-depth reference documents [linked above](/docs/voice/twiml#twiml-verbs-for-programmable-voice).

You may also want to explore how to generate TwiML with Twilio's [SDKs](/docs/libraries), provided to let you generate TwiML in your favorite language.

For a guided walkthrough, check out our [server-side Programmable Voice quickstart](/docs/voice/quickstart/server).


## Webhooks

### Tipos de Webhooks

| Webhook | Descrição | Quando usar |
|---------|-----------|-------------|
| `url` | TwiML inicial para controlar a chamada | Definir fluxo da chamada |
| `statusCallback` | Notifica mudanças no status da chamada | Atualizar UI em tempo real, registrar histórico |
| `statusCallbackEvent` | Eventos específicos (initiated, ringing, answered, completed) | Tracking granular do ciclo de vida |
| `recordingStatusCallback` | Notifica quando gravação está disponível | Salvar URL da gravação automaticamente |
| `fallbackUrl` | URL alternativa se o principal falhar | Tratamento de erros |

### Parâmetros Comuns Recebidos nos Webhooks

| Parâmetro | Descrição | Exemplo |
|-----------|-----------|---------|
| `CallSid` | ID único da chamada | `CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `AccountSid` | ID da conta Twilio | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `CallStatus` | Status atual da chamada | `queued`, `ringing`, `in-progress`, `completed`, `busy`, `failed`, `no-answer`, `canceled` |
| `From` | Número de origem (formato E.164) | `+5511999999999` |
| `To` | Número de destino (formato E.164) | `+5511888888888` |
| `Direction` | Direção da chamada | `inbound`, `outbound-api`, `outbound-dial` |
| `CallDuration` | Duração em segundos (apenas em completed) | `125` |
| `Caller` | Mesmo que From | `+5511999999999` |
| `Called` | Mesmo que To | `+5511888888888` |
| `ApiVersion` | Versão da API | `2010-04-01` |

### Parâmetros Adicionais por Tipo de Evento

#### Em chamadas completadas (`completed`)
| Parâmetro | Descrição |
|-----------|-----------|
| `CallDuration` | Duração total em segundos |
| `RecordingUrl` | URL da gravação (se habilitada) |
| `RecordingSid` | ID da gravação |
| `RecordingDuration` | Duração da gravação |

#### Em chamadas Dial
| Parâmetro | Descrição |
|-----------|-----------|
| `DialCallStatus` | Status da perna B (completed, busy, no-answer, failed, canceled) |
| `DialCallSid` | SID da chamada da perna B |
| `DialCallDuration` | Duração da perna B |

### Eventos de Status (`statusCallbackEvent`)

| Evento | Descrição | Momento |
|--------|-----------|---------|
| `initiated` | Chamada foi criada e removida da fila | Início do processo |
| `ringing` | Telefone está tocando | Aguardando atendimento |
| `answered` | Chamada foi atendida | Conversação iniciada |
| `completed` | Chamada finalizada (qualquer motivo) | Fim da chamada |

### Como Responder aos Webhooks

#### Status Callbacks (não controlam fluxo)
```http
HTTP/1.1 204 No Content
```

Ou:
```http
HTTP/1.1 200 OK
Content-Type: text/xml

<?xml version="1.0" encoding="UTF-8"?>
<Response/>
```

#### Webhooks TwiML (controlam fluxo)
```http
HTTP/1.1 200 OK
Content-Type: text/xml

<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Olá! Aguarde enquanto conectamos você.</Say>
    <Dial callerId="+5511999999999">+5511888888888</Dial>
</Response>
```

### Validação de Webhooks (Segurança)

É importante validar que as requisições realmente vêm do Twilio:

```typescript
import twilio from 'twilio';

const authToken = 'your_auth_token';
const twilioSignature = req.headers['x-twilio-signature'];
const url = 'https://your-webhook-url.com/webhook';
const params = req.body;

const isValid = twilio.validateRequest(authToken, twilioSignature, url, params);

if (!isValid) {
  return new Response('Forbidden', { status: 403 });
}
```

---

## Implementation Examples

### Estrutura de Dados Sugerida para o CRM

```sql
-- Tabela para registrar histórico de chamadas
CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  contact_id UUID REFERENCES contacts(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  -- Identificadores Twilio
  call_sid TEXT UNIQUE NOT NULL,
  parent_call_sid TEXT,
  
  -- Números
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  
  -- Status e direção
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'initiated',
  
  -- Métricas
  duration_seconds INTEGER,
  
  -- Gravação
  recording_url TEXT,
  recording_sid TEXT,
  recording_duration INTEGER,
  
  -- Timestamps
  started_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Metadados
  notes TEXT,
  opportunity_id UUID REFERENCES opportunities(id)
);

-- Índices para consultas comuns
CREATE INDEX idx_call_logs_org ON call_logs(organization_id);
CREATE INDEX idx_call_logs_contact ON call_logs(contact_id);
CREATE INDEX idx_call_logs_user ON call_logs(user_id);
CREATE INDEX idx_call_logs_call_sid ON call_logs(call_sid);
CREATE INDEX idx_call_logs_created ON call_logs(created_at DESC);

-- RLS Policy
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view call logs in their org"
ON call_logs FOR SELECT
USING (user_has_org_access(organization_id));

CREATE POLICY "Users can insert call logs in their org"
ON call_logs FOR INSERT
WITH CHECK (user_has_org_access(organization_id));

CREATE POLICY "Users can update call logs in their org"
ON call_logs FOR UPDATE
USING (user_has_org_access(organization_id));
```

### Edge Function: Iniciar Chamada (Click-to-Call)

```typescript
// supabase/functions/twilio-call/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CallRequest {
  to: string           // Número do contato (E.164)
  contactId?: string   // ID do contato no CRM
  opportunityId?: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Verificar autenticação
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Buscar dados do usuário e organização
    const { data: userData } = await supabaseClient
      .from('users')
      .select('id, organization_id:user_organizations(organization_id)')
      .eq('auth_user_id', user.id)
      .single()

    if (!userData) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const organizationId = userData.organization_id[0]?.organization_id

    // Buscar configuração Twilio da organização
    const { data: integration } = await supabaseClient
      .from('organization_integrations')
      .select('config_values')
      .eq('organization_id', organizationId)
      .eq('integration_id', 'twilio-voice-integration-id') // ID da integração Twilio
      .single()

    if (!integration?.config_values) {
      return new Response(JSON.stringify({ error: 'Twilio not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const config = integration.config_values as {
      accountSid: string
      authToken: string
      phoneNumber: string
      agentPhoneNumber: string
    }

    // Dados da requisição
    const { to, contactId, opportunityId }: CallRequest = await req.json()

    if (!to) {
      return new Response(JSON.stringify({ error: 'Phone number required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // URL base para webhooks
    const webhookBaseUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/twilio-webhook'

    // Criar chamada via Twilio API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`
    
    const callParams = new URLSearchParams({
      To: config.agentPhoneNumber,  // Liga primeiro para o agente
      From: config.phoneNumber,      // Número Twilio
      Url: `${webhookBaseUrl}/twiml?to=${encodeURIComponent(to)}`, // TwiML para conectar ao contato
      StatusCallback: `${webhookBaseUrl}/status`,
      StatusCallbackEvent: 'initiated ringing answered completed',
      StatusCallbackMethod: 'POST',
      Record: 'true',
      RecordingStatusCallback: `${webhookBaseUrl}/recording`,
    })

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${config.accountSid}:${config.authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: callParams,
    })

    const callData = await twilioResponse.json()

    if (!twilioResponse.ok) {
      console.error('Twilio error:', callData)
      return new Response(JSON.stringify({ error: 'Failed to initiate call', details: callData }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Registrar chamada no banco
    const { data: callLog, error: insertError } = await supabaseClient
      .from('call_logs')
      .insert({
        organization_id: organizationId,
        user_id: userData.id,
        contact_id: contactId || null,
        opportunity_id: opportunityId || null,
        call_sid: callData.sid,
        from_number: config.phoneNumber,
        to_number: to,
        direction: 'outbound',
        status: 'initiated',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Database error:', insertError)
    }

    return new Response(JSON.stringify({
      success: true,
      callSid: callData.sid,
      status: callData.status,
      callLogId: callLog?.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

### Edge Function: Webhook Handler

```typescript
// supabase/functions/twilio-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = url.pathname.split('/').pop()

  // Criar cliente Supabase com service role para webhooks
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    // Parse form data do Twilio
    const formData = await req.formData()
    const params: Record<string, string> = {}
    formData.forEach((value, key) => {
      params[key] = value.toString()
    })

    console.log(`Webhook ${path}:`, JSON.stringify(params, null, 2))

    switch (path) {
      case 'twiml':
        // Retorna TwiML para conectar ao contato
        return handleTwiML(url.searchParams.get('to'))

      case 'status':
        // Atualiza status da chamada
        return await handleStatusCallback(supabaseAdmin, params)

      case 'recording':
        // Salva URL da gravação
        return await handleRecordingCallback(supabaseAdmin, params)

      default:
        return new Response('Not found', { status: 404 })
    }

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response('Error', { status: 500 })
  }
})

function handleTwiML(to: string | null): Response {
  if (!to) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="pt-BR">Erro: número de destino não informado.</Say>
  <Hangup/>
</Response>`
    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    })
  }

  // TwiML para:
  // 1. Informar o agente
  // 2. Conectar ao número do contato
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="pt-BR">Conectando você ao contato. Aguarde.</Say>
  <Dial callerId="${Deno.env.get('TWILIO_PHONE_NUMBER')}" 
        timeout="30" 
        record="record-from-answer-dual"
        action="/functions/v1/twilio-webhook/dial-complete">
    <Number>${to}</Number>
  </Dial>
  <Say language="pt-BR">A chamada não foi completada.</Say>
</Response>`

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml' }
  })
}

async function handleStatusCallback(
  supabase: any, 
  params: Record<string, string>
): Promise<Response> {
  const { CallSid, CallStatus, CallDuration, Timestamp } = params

  const updateData: Record<string, any> = {
    status: CallStatus,
    updated_at: new Date().toISOString(),
  }

  // Adicionar timestamps baseado no status
  switch (CallStatus) {
    case 'ringing':
      // Chamada está tocando
      break
    case 'in-progress':
    case 'answered':
      updateData.answered_at = new Date().toISOString()
      break
    case 'completed':
    case 'busy':
    case 'no-answer':
    case 'failed':
    case 'canceled':
      updateData.ended_at = new Date().toISOString()
      if (CallDuration) {
        updateData.duration_seconds = parseInt(CallDuration)
      }
      break
  }

  const { error } = await supabase
    .from('call_logs')
    .update(updateData)
    .eq('call_sid', CallSid)

  if (error) {
    console.error('Error updating call status:', error)
  }

  // Twilio espera resposta vazia ou 204
  return new Response(null, { status: 204 })
}

async function handleRecordingCallback(
  supabase: any,
  params: Record<string, string>
): Promise<Response> {
  const { 
    CallSid, 
    RecordingSid, 
    RecordingUrl, 
    RecordingDuration,
    RecordingStatus 
  } = params

  if (RecordingStatus !== 'completed') {
    return new Response(null, { status: 204 })
  }

  const { error } = await supabase
    .from('call_logs')
    .update({
      recording_sid: RecordingSid,
      recording_url: RecordingUrl + '.mp3', // Adiciona extensão para download direto
      recording_duration: parseInt(RecordingDuration),
      updated_at: new Date().toISOString(),
    })
    .eq('call_sid', CallSid)

  if (error) {
    console.error('Error updating recording:', error)
  }

  return new Response(null, { status: 204 })
}
```

### Componente React: Botão Click-to-Call

```typescript
// src/components/contacts/ClickToCallButton.tsx
import { useState } from 'react';
import { Phone, PhoneOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ClickToCallButtonProps {
  phoneNumber: string;
  contactId?: string;
  opportunityId?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function ClickToCallButton({
  phoneNumber,
  contactId,
  opportunityId,
  variant = 'outline',
  size = 'sm',
}: ClickToCallButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [callSid, setCallSid] = useState<string | null>(null);

  const handleCall = async () => {
    if (!phoneNumber) {
      toast.error('Número de telefone não disponível');
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('twilio-call', {
        body: {
          to: phoneNumber,
          contactId,
          opportunityId,
        },
      });

      if (error) throw error;

      if (data.success) {
        setCallSid(data.callSid);
        toast.success('Chamada iniciada! Aguarde o telefone tocar.');
      } else {
        throw new Error(data.error || 'Erro ao iniciar chamada');
      }
    } catch (error: any) {
      console.error('Call error:', error);
      toast.error(error.message || 'Erro ao iniciar chamada');
    } finally {
      setIsLoading(false);
    }
  };

  const formatPhone = (phone: string) => {
    // Formata para exibição amigável
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13 && cleaned.startsWith('55')) {
      const ddd = cleaned.slice(2, 4);
      const part1 = cleaned.slice(4, 9);
      const part2 = cleaned.slice(9);
      return `(${ddd}) ${part1}-${part2}`;
    }
    return phone;
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleCall}
      disabled={isLoading || !phoneNumber}
      className="gap-2"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Phone className="h-4 w-4" />
      )}
      {size !== 'icon' && (
        <span>{isLoading ? 'Ligando...' : formatPhone(phoneNumber)}</span>
      )}
    </Button>
  );
}
```

### Fluxo Completo de uma Chamada Outbound

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUXO DE CHAMADA OUTBOUND                            │
└─────────────────────────────────────────────────────────────────────────────┘

1. USUÁRIO INICIA CHAMADA
   ┌──────────┐     POST /twilio-call      ┌──────────────┐
   │   CRM    │ ─────────────────────────► │ Edge Function│
   │ Frontend │                            │  twilio-call │
   └──────────┘                            └──────┬───────┘
                                                  │
2. EDGE FUNCTION CRIA CHAMADA                     │
                                                  ▼
   ┌──────────────┐    POST /Calls.json    ┌──────────────┐
   │ Edge Function│ ─────────────────────► │   Twilio     │
   │  twilio-call │                        │     API      │
   └──────────────┘                        └──────┬───────┘
         │                                        │
         │ INSERT call_logs                       │
         ▼                                        │
   ┌──────────────┐                               │
   │   Supabase   │                               │
   │   Database   │                               │
   └──────────────┘                               │
                                                  │
3. TWILIO LIGA PARA O AGENTE                      │
                                                  ▼
   ┌──────────────┐    Chamada telefônica  ┌──────────────┐
   │    Twilio    │ ─────────────────────► │   Telefone   │
   │              │                        │   do Agente  │
   └──────┬───────┘                        └──────────────┘
         │
         │ statusCallback (initiated, ringing, answered)
         ▼
   ┌──────────────┐
   │ Edge Function│
   │twilio-webhook│
   └──────┬───────┘
         │ UPDATE call_logs
         ▼
   ┌──────────────┐
   │   Supabase   │
   │   Database   │
   └──────────────┘

4. AGENTE ATENDE, TWILIO BUSCA TwiML
   ┌──────────────┐    GET /twiml?to=...   ┌──────────────┐
   │    Twilio    │ ─────────────────────► │ Edge Function│
   │              │ ◄───────────────────── │twilio-webhook│
   └──────────────┘    <Dial><Number>      └──────────────┘

5. TWILIO CONECTA AO CONTATO
   ┌──────────────┐    Chamada telefônica  ┌──────────────┐
   │    Twilio    │ ─────────────────────► │   Telefone   │
   │              │                        │  do Contato  │
   └──────────────┘                        └──────────────┘

6. CHAMADA EM ANDAMENTO (gravando)
   ┌──────────────┐ ◄────────────────────► ┌──────────────┐
   │   Telefone   │      Conversação       │   Telefone   │
   │   do Agente  │      (via Twilio)      │  do Contato  │
   └──────────────┘                        └──────────────┘

7. CHAMADA ENCERRADA
   ┌──────────────┐   statusCallback       ┌──────────────┐
   │    Twilio    │ ─────────────────────► │ Edge Function│
   │              │   (completed)          │twilio-webhook│
   └──────────────┘                        └──────┬───────┘
                                                  │
   ┌──────────────┐  recordingCallback            │
   │    Twilio    │ ─────────────────────────────►│
   │              │  (recording URL)              │
   └──────────────┘                               │
                                                  │ UPDATE call_logs
                                                  ▼
   ┌──────────────┐
   │   Supabase   │  status: completed
   │   Database   │  duration_seconds: 125
   └──────────────┘  recording_url: https://...

8. UI ATUALIZA (via Realtime ou polling)
   ┌──────────────┐     Subscription       ┌──────────────┐
   │   Supabase   │ ─────────────────────► │     CRM      │
   │   Realtime   │                        │   Frontend   │
   └──────────────┘                        └──────────────┘
```

### Configuração Necessária

1. **Secrets no Supabase:**
   - `TWILIO_ACCOUNT_SID` - Account SID da sua conta Twilio
   - `TWILIO_AUTH_TOKEN` - Auth Token da sua conta Twilio
   - `TWILIO_PHONE_NUMBER` - Número Twilio para caller ID

2. **Configurar `verify_jwt = false` para webhook:**
   ```toml
   # supabase/config.toml
   [functions.twilio-webhook]
   verify_jwt = false
   ```

3. **Configurar URLs no Twilio Console:**
   - Voice Configuration URL: `https://<project-ref>.supabase.co/functions/v1/twilio-webhook/twiml`
