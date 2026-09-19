/**
 * patch-wwebjs.js
 * Automatically patches whatsapp-web.js to handle WhatsApp Web updates gracefully:
 * 1. Hardens Store.js (V6):
 *    - Uses safeReq to prevent "Cannot read properties of undefined (reading 'setPushname')".
 *    - Wraps memoized getters (ChatGetters, ContactMethods, EphemeralFields, etc.) with safe fallbacks.
 *    - Prototype-level patching on ContactCollection (get, assertGet, find) to ensure ANY lookup
 *      for ANY recipient (saved or unsaved) ALWAYS returns a valid Contact model with .id and .phoneNumber.
 *    - Intercepts ChatModel.prototype.contact so chat.contact is NEVER undefined for unsaved recipients.
 *    - Guarantees FindOrCreateChat.findOrCreateLatestChat fallback returns a chat model with .msgs collection.
 * 2. Hardens Utils.js:
 *    - Guards isChannel / isStatus checks in sendMessage against missing chat or missing id.
 *    - Protects ephemeralFields retrieval with try/catch.
 *    - Makes sendSeen resilient with try/catch.
 *    - Validates chat.msgs in getChat so dummy objects are never returned.
 *    - Sets chat.contact and wraps addAndSendMsgToChat with try/catch and retry.
 *    - Replaces getContactModel with safeGetter wrappers around all 14 ContactMethods getters.
 *    - Protects getContact against setting contact.id to undefined on @lid contacts.
 *    - Guarantees message model return after addAndSendMsgToChat.
 * 3. Hardens Client.js:
 *    - Pre-seeds contacts before sending.
 *    - Validates chat.msgs and throws if chat could not be found/created.
 *    - Fallback message model stub so sendMessage never throws after message dispatch.
 *    - Hardens ClientInfo construction against undefined properties.
 *    - Adds UI fallback for ready event.
 *    - Persists storage permissions and guards against spurious logouts.
 */

const fs = require('fs');
const path = require('path');

function patchStore() {
    const storePath = path.join(__dirname, 'node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Store.js');
    if (!fs.existsSync(storePath)) {
        console.log('[patch-wwebjs] Store.js not found at:', storePath);
        return false;
    }

    const content = fs.readFileSync(storePath, 'utf8');
    if (content.includes('wrapModuleGettersSafelyV6')) {
        console.log('[patch-wwebjs] Store.js already patched with V6 memoized getter & prototype guards.');
        return true;
    }

    const patchedStore = `'use strict';

exports.ExposeStore = () => {
    /**
     * Helper function that compares between two WWeb versions.
     */
    window.compareWwebVersions = (lOperand, operator, rOperand) => {
        if (!['>', '>=', '<', '<=', '='].includes(operator)) {
            throw new class _ extends Error {
                constructor(m) { super(m); this.name = 'CompareWwebVersionsError'; }
            }('Invalid comparison operator is provided');
        }
        if (typeof lOperand !== 'string' || typeof rOperand !== 'string') {
            throw new class _ extends Error {
                constructor(m) { super(m); this.name = 'CompareWwebVersionsError'; }
            }('A non-string WWeb version type is provided');
        }

        lOperand = lOperand.replace(/-beta$/, '');
        rOperand = rOperand.replace(/-beta$/, '');

        while (lOperand.length !== rOperand.length) {
            lOperand.length > rOperand.length
                ? rOperand = rOperand.concat('0')
                : lOperand = lOperand.concat('0');
        }

        lOperand = Number(lOperand.replace(/\\./g, ''));
        rOperand = Number(rOperand.replace(/\\./g, ''));

        return (
            operator === '>' ? lOperand > rOperand :
                operator === '>=' ? lOperand >= rOperand :
                    operator === '<' ? lOperand < rOperand :
                        operator === '<=' ? lOperand <= rOperand :
                            operator === '=' ? lOperand === rOperand :
                                false
        );
    };

    const safeReq = (moduleName) => {
        try {
            return window.require(moduleName);
        } catch (_) {
            return undefined;
        }
    };

    /**
     * Webpack 5 modules export functions using Object.defineProperty(exports, prop, { get: ... }).
     * Simply doing mod[key] = guarded is a SILENT NO-OP on getter-only properties!
     * We must use Object.defineProperty to override the property descriptor directly.
     */
    const wrapModuleGettersSafelyV6 = (mod) => {
        if (!mod || typeof mod !== 'object') return mod;
        const keys = [...new Set([...Object.getOwnPropertyNames(mod), ...Object.keys(mod)])];
        for (const key of keys) {
            try {
                let fn = null;
                const desc = Object.getOwnPropertyDescriptor(mod, key);
                if (desc) {
                    if (typeof desc.value === 'function') {
                        fn = desc.value;
                    } else if (typeof desc.get === 'function') {
                        try { fn = desc.get(); } catch (_) {}
                    }
                }
                if (!fn && typeof mod[key] === 'function') {
                    fn = mod[key];
                }
                if (typeof fn === 'function' && !fn._memoizeGuardedV6) {
                    const origFn = fn;
                    const guarded = function(...args) {
                        try {
                            return origFn.apply(this, args);
                        } catch (err) {
                            if (err && err.message && (err.message.includes('Data passed to getter') || err.message.includes('how we memoize') || err.message.includes('memoize'))) {
                                return false;
                            }
                            throw err;
                        }
                    };
                    guarded._memoizeGuardedV6 = true;
                    try {
                        Object.defineProperty(mod, key, {
                            value: guarded,
                            writable: true,
                            configurable: true,
                            enumerable: true
                        });
                    } catch (_) {
                        try { mod[key] = guarded; } catch (_) {}
                    }
                }
            } catch (_) {}
        }
        return mod;
    };

    window.WWebJS = window.WWebJS || {};
    window.WWebJS.wrapModuleGettersSafely = wrapModuleGettersSafelyV6;

    window.Store = Object.assign({}, safeReq('WAWebCollections') || {});
    window.Store.AppState = (safeReq('WAWebSocketModel') || {}).Socket;
    window.Store.BlockContact = safeReq('WAWebBlockContactAction');
    window.Store.Conn = (safeReq('WAWebConnModel') || {}).Conn;
    window.Store.Cmd = (safeReq('WAWebCmd') || {}).Cmd;
    window.Store.DownloadManager = (safeReq('WAWebDownloadManager') || {}).downloadManager;
    window.Store.GroupQueryAndUpdate = (safeReq('WAWebGroupQueryJob') || {}).queryAndUpdateGroupMetadataById;
    window.Store.MediaPrep = safeReq('WAWebPrepRawMedia');
    window.Store.MediaObject = safeReq('WAWebMediaStorage');
    window.Store.MediaTypes = safeReq('WAWebMmsMediaTypes');
    window.Store.MediaUpload = {
        ...(safeReq('WAWebMediaMmsV4Upload') || {}),
        ...(safeReq('WAWebStartMediaUploadQpl') || {})
    };
    window.Store.MediaUpdate = safeReq('WAWebMediaUpdateMsg');
    window.Store.MsgKey = safeReq('WAWebMsgKey');
    window.Store.OpaqueData = safeReq('WAWebMediaOpaqueData');
    window.Store.QueryProduct = safeReq('WAWebBizProductCatalogBridge');
    window.Store.QueryOrder = safeReq('WAWebBizOrderBridge');
    window.Store.SendClear = safeReq('WAWebChatClearBridge');
    window.Store.SendDelete = safeReq('WAWebDeleteChatAction');
    window.Store.SendMessage = safeReq('WAWebSendMsgChatAction');
    window.Store.EditMessage = safeReq('WAWebSendMessageEditAction');
    window.Store.MediaDataUtils = safeReq('WAWebMediaDataUtils');
    window.Store.BlobCache = safeReq('WAWebMediaInMemoryBlobCache');
    window.Store.SendSeen = safeReq('WAWebUpdateUnreadChatAction');
    window.Store.User = safeReq('WAWebUserPrefsMeUser');
    window.Store.ContactMethods = wrapModuleGettersSafelyV6({
        ...(safeReq('WAWebContactGetters') || {}),
        ...(safeReq('WAWebFrontendContactGetters') || {})
    });
    wrapModuleGettersSafelyV6(safeReq('WAWebContactGetters'));
    wrapModuleGettersSafelyV6(safeReq('WAWebFrontendContactGetters'));
    wrapModuleGettersSafelyV6(safeReq('WAWebAddressbookContactGetters'));
    wrapModuleGettersSafelyV6(safeReq('WAWebBusinessProfileGetters'));
    wrapModuleGettersSafelyV6(safeReq('WAWebGroupGetters'));
    wrapModuleGettersSafelyV6(safeReq('WAWebEphemeralFieldsGetters'));
    wrapModuleGettersSafelyV6(safeReq('WAWebGetEphemeralFieldsMsgActionsUtils'));
    wrapModuleGettersSafelyV6(safeReq('WAWebChatGetters'));
    wrapModuleGettersSafelyV6(safeReq('WAWebFrontendChatGetters'));
    wrapModuleGettersSafelyV6(safeReq('WAWebWidUtils'));
    window.Store.UserConstructor = safeReq('WAWebWid');
    window.Store.Validators = safeReq('WALinkify');
    window.Store.WidFactory = safeReq('WAWebWidFactory');
    window.Store.ProfilePic = safeReq('WAWebContactProfilePicThumbBridge');
    window.Store.PresenceUtils = safeReq('WAWebPresenceChatAction');
    window.Store.ChatState = safeReq('WAWebChatStateBridge');
    window.Store.findCommonGroups = (safeReq('WAWebFindCommonGroupsContactAction') || {}).findCommonGroups;
    window.Store.ConversationMsgs = safeReq('WAWebChatLoadMessages');
    window.Store.sendReactionToMsg = (safeReq('WAWebSendReactionMsgAction') || {}).sendReactionToMsg;
    window.Store.createOrUpdateReactionsModule = safeReq('WAWebDBCreateOrUpdateReactions');
    window.Store.EphemeralFields = wrapModuleGettersSafelyV6(safeReq('WAWebGetEphemeralFieldsMsgActionsUtils'));
    window.Store.MsgActionChecks = safeReq('WAWebMsgActionCapability');
    window.Store.QuotedMsg = safeReq('WAWebQuotedMsgModelUtils');
    window.Store.LinkPreview = safeReq('WAWebLinkPreviewChatAction');
    window.Store.Socket = safeReq('WADeprecatedSendIq');
    window.Store.SocketWap = safeReq('WAWap');
    window.Store.SearchContext = safeReq('WAWebChatMessageSearch');
    window.Store.DrawerManager = (safeReq('WAWebDrawerManager') || {}).DrawerManager;
    window.Store.LidUtils = safeReq('WAWebApiContact');
    window.Store.WidToJid = safeReq('WAWebWidToJid');
    window.Store.JidToWid = safeReq('WAWebJidToWid');
    window.Store.getMsgInfo = (safeReq('WAWebApiMessageInfoStore') || {}).queryMsgInfo;
    window.Store.QueryExist = (safeReq('WAWebQueryExistsJob') || {}).queryWidExists;
    window.Store.ReplyUtils = safeReq('WAWebMsgReply');
    window.Store.BotSecret = safeReq('WAWebBotMessageSecret');
    window.Store.BotProfiles = safeReq('WAWebBotProfileCollection');
    window.Store.ContactCollection = (safeReq('WAWebContactCollection') || {}).ContactCollection;
    window.Store.DeviceList = safeReq('WAWebApiDeviceList');
    window.Store.HistorySync = safeReq('WAWebSendNonMessageDataRequest');
    window.Store.AddonReactionTable = (safeReq('WAWebAddonReactionTableMode') || {}).reactionTableMode;
    window.Store.AddonPollVoteTable = (safeReq('WAWebAddonPollVoteTableMode') || {}).pollVoteTableMode;
    window.Store.ChatGetters = wrapModuleGettersSafelyV6(safeReq('WAWebChatGetters'));
    window.Store.UploadUtils = safeReq('WAWebUploadManager');
    window.Store.WAWebStreamModel = safeReq('WAWebStreamModel');
    window.Store.FindOrCreateChat = safeReq('WAWebFindChatAction');
    window.Store.CustomerNoteUtils = safeReq('WAWebNoteAction');
    window.Store.BusinessGatingUtils = safeReq('WAWebBizGatingUtils');
    window.Store.PollsVotesSchema = safeReq('WAWebPollsVotesSchema');
    window.Store.PollsSendVote = safeReq('WAWebPollsSendVoteMsgAction');

    const setPushnameAction = safeReq('WAWebSetPushnameConnAction') || {};
    window.Store.Settings = {
        ...(safeReq('WAWebUserPrefsGeneral') || {}),
        ...(safeReq('WAWebUserPrefsNotifications') || {}),
        setPushname: setPushnameAction.setPushname || (() => Promise.resolve())
    };
    window.Store.NumberInfo = {
        ...(safeReq('WAPhoneUtils') || {}),
        ...(safeReq('WAPhoneFindCC') || {})
    };
    window.Store.ForwardUtils = {
        ...(safeReq('WAWebChatForwardMessage') || {})
    };
    window.Store.PinnedMsgUtils = {
        ...(safeReq('WAWebPinInChatSchema') || {}),
        ...(safeReq('WAWebSendPinMessageAction') || {})
    };
    window.Store.ScheduledEventMsgUtils = {
        ...(safeReq('WAWebGenerateEventCallLink') || {}),
        ...(safeReq('WAWebSendEventEditMsgAction') || {}),
        ...(safeReq('WAWebSendEventResponseMsgAction') || {})
    };
    window.Store.VCard = {
        ...(safeReq('WAWebFrontendVcardUtils') || {}),
        ...(safeReq('WAWebVcardParsingUtils') || {}),
        ...(safeReq('WAWebVcardGetNameFromParsed') || {})
    };
    window.Store.StickerTools = {
        ...(safeReq('WAWebImageUtils') || {}),
        ...(safeReq('WAWebAddWebpMetadata') || {})
    };
    window.Store.GroupUtils = {
        ...(safeReq('WAWebGroupCreateJob') || {}),
        ...(safeReq('WAWebGroupModifyInfoJob') || {}),
        ...(safeReq('WAWebExitGroupAction') || {}),
        ...(safeReq('WAWebContactProfilePicThumbBridge') || {}),
        ...(safeReq('WAWebSetPropertyGroupAction') || {})
    };
    window.Store.GroupParticipants = {
        ...(safeReq('WAWebModifyParticipantsGroupAction') || {}),
        ...(safeReq('WASmaxGroupsAddParticipantsRPC') || {})
    };
    window.Store.GroupInvite = {
        ...(safeReq('WAWebGroupInviteJob') || {}),
        ...(safeReq('WAWebGroupQueryJob') || {}),
        ...(safeReq('WAWebMexFetchGroupInviteCodeJob') || {})
    };
    window.Store.GroupInviteV4 = {
        ...(safeReq('WAWebGroupInviteV4Job') || {}),
        ...(safeReq('WAWebChatSendMessages') || {})
    };
    window.Store.MembershipRequestUtils = {
        ...(safeReq('WAWebApiMembershipApprovalRequestStore') || {}),
        ...(safeReq('WASmaxGroupsMembershipRequestsActionRPC') || {})
    };
    const l10nMod = safeReq('WAWebL10N');
    window.Store.ChannelUtils = {
        ...(safeReq('WAWebLoadNewsletterPreviewChatAction') || {}),
        ...(safeReq('WAWebNewsletterMetadataQueryJob') || {}),
        ...(safeReq('WAWebNewsletterCreateQueryJob') || {}),
        ...(safeReq('WAWebEditNewsletterMetadataAction') || {}),
        ...(safeReq('WAWebNewsletterDeleteAction') || {}),
        ...(safeReq('WAWebNewsletterSubscribeAction') || {}),
        ...(safeReq('WAWebNewsletterUnsubscribeAction') || {}),
        ...(safeReq('WAWebNewsletterDirectorySearchAction') || {}),
        ...(safeReq('WAWebNewsletterGatingUtils') || {}),
        ...(safeReq('WAWebNewsletterModelUtils') || {}),
        ...(safeReq('WAWebMexAcceptNewsletterAdminInviteJob') || {}),
        ...(safeReq('WAWebMexRevokeNewsletterAdminInviteJob') || {}),
        ...(safeReq('WAWebChangeNewsletterOwnerAction') || {}),
        ...(safeReq('WAWebDemoteNewsletterAdminAction') || {}),
        ...(safeReq('WAWebNewsletterDemoteAdminJob') || {}),
        countryCodesIso: safeReq('WAWebCountriesNativeCountryNames') || {},
        currentRegion: (l10nMod && typeof l10nMod.getRegion === 'function') ? l10nMod.getRegion() : '',
    };
    window.Store.SendChannelMessage = {
        ...(safeReq('WAWebNewsletterUpdateMsgsRecordsJob') || {}),
        ...(safeReq('WAWebMsgDataFromModel') || {}),
        ...(safeReq('WAWebNewsletterSendMessageJob') || {}),
        ...(safeReq('WAWebNewsletterSendMsgAction') || {}),
        ...(safeReq('WAMediaCalculateFilehash') || {})
    };
    window.Store.ChannelSubscribers = {
        ...(safeReq('WAWebMexFetchNewsletterSubscribersJob') || {}),
        ...(safeReq('WAWebNewsletterSubscriberListAction') || {})
    };
    window.Store.AddressbookContactUtils = {
        ...(safeReq('WAWebSaveContactAction') || {}),
        ...(safeReq('WAWebDeleteContactAction') || {})
    };
    window.Store.StatusUtils = {
        ...(safeReq('WAWebContactStatusBridge') || {}),
        ...(safeReq('WAWebSendStatusMsgAction') || {}),
        ...(safeReq('WAWebRevokeStatusAction') || {}),
        ...(safeReq('WAWebStatusGatingUtils') || {})
    };

    const syntheticContactCache = new Map();
    const createSyntheticContact = (wid, col) => {
        if (!wid) return null;
        const serialized = typeof wid === 'string'
            ? wid
            : (wid && wid._serialized ? wid._serialized : (typeof wid?.toString === 'function' ? wid.toString() : String(wid || '')));
        if (serialized && syntheticContactCache.has(serialized)) {
            return syntheticContactCache.get(serialized);
        }
        let widObj = wid;
        if (typeof wid === 'string' && window.Store && window.Store.WidFactory && typeof window.Store.WidFactory.createWid === 'function') {
            try { widObj = window.Store.WidFactory.createWid(wid); } catch (_) {}
        }
        const userPart = (widObj && widObj.user) || (serialized ? serialized.split('@')[0] : '');

        // Attempt to create a real ContactModel instance if possible
        try {
            const ModelClass = (col && col._modelClass) || (window.Store && window.Store.Contact && window.Store.Contact._modelClass);
            if (ModelClass) {
                const model = new ModelClass({
                    id: widObj,
                    phoneNumber: widObj,
                    userid: userPart
                });
                if (model && model.id) {
                    if (col && typeof col.add === 'function') {
                        try { col.add(model); } catch (_) {}
                    } else if (window.Store && window.Store.Contact && typeof window.Store.Contact.add === 'function') {
                        try { window.Store.Contact.add(model); } catch (_) {}
                    }
                    if (serialized) syntheticContactCache.set(serialized, model);
                    return model;
                }
            }
        } catch (_) {}

        const synthetic = {
            id: widObj,
            phoneNumber: widObj, // CRITICAL: NEVER undefined!
            userid: userPart,
            isContact: false,
            isUser: true,
            isGroup: false,
            isBroadcast: false,
            isPSA: false,
            isBusiness: false,
            isEnterprise: false,
            isSmb: false,
            shortName: '',
            name: '',
            pushname: '',
            verifiedName: '',
            type: 'in',
            isLid: () => Boolean(wid && (typeof wid.isLid === 'function' ? wid.isLid() : (serialized && serialized.endsWith('@lid')))),
            isMe: () => false,
            getCollection: () => col || (window.Store && window.Store.Contact),
            serialize: () => ({ id: widObj, phoneNumber: widObj, name: '', pushname: '', isBusiness: false }),
            trigger: () => {},
            on: () => {},
            off: () => {},
            listenTo: () => {},
            hasChanged: () => false,
            get: (prop) => (prop === 'id' ? widObj : prop === 'phoneNumber' ? widObj : synthetic[prop]),
            set: () => synthetic
        };
        if (serialized) {
            syntheticContactCache.set(serialized, synthetic);
        }
        return synthetic;
    };

    window.WWebJS.createSyntheticContact = createSyntheticContact;

    /**
     * Patch ContactCollection prototypes recursively so ANY internal module
     * calling get(), assertGet(), or find() never gets undefined for any WID.
     */
    const patchCollectionProto = (colInstance, colClass) => {
        const targets = new Set();
        if (colInstance) {
            targets.add(colInstance);
            const p1 = Object.getPrototypeOf(colInstance);
            if (p1) {
                targets.add(p1);
                const p2 = Object.getPrototypeOf(p1);
                if (p2) targets.add(p2);
            }
        }
        if (colClass && colClass.prototype) {
            targets.add(colClass.prototype);
            const p1 = Object.getPrototypeOf(colClass.prototype);
            if (p1) targets.add(p1);
        }

        for (const target of targets) {
            if (!target || target._guardedV6) continue;
            target._guardedV6 = true;

            const origGet = target.get;
            if (typeof origGet === 'function') {
                target.get = function(wid) {
                    if (!wid) return origGet.apply(this, arguments);
                    let found;
                    try { found = origGet.apply(this, arguments); } catch (_) {}
                    if (found && found.id) return found;
                    return createSyntheticContact(wid, this);
                };
            }

            const origAssertGet = target.assertGet;
            if (typeof origAssertGet === 'function') {
                target.assertGet = function(wid) {
                    if (!wid) return origAssertGet.apply(this, arguments);
                    let found;
                    try { found = origAssertGet.apply(this, arguments); } catch (_) {}
                    if (found && found.id) return found;
                    return createSyntheticContact(wid, this);
                };
            }

            const origFind = target.find;
            if (typeof origFind === 'function') {
                target.find = async function(wid) {
                    if (!wid) return origFind.apply(this, arguments);
                    let found;
                    try { found = await origFind.apply(this, arguments); } catch (_) {}
                    if (found && found.id) return found;
                    return createSyntheticContact(wid, this);
                };
            }
        }
    };

    if (window.Store.Contact) {
        patchCollectionProto(window.Store.Contact, window.Store.ContactCollection);
    }
    if (window.Store.ContactCollection) {
        patchCollectionProto(null, window.Store.ContactCollection);
    }

    /**
     * Guard ChatModel.prototype.contact getter so chat.contact is NEVER undefined
     */
    if (window.Store.Chat && window.Store.Chat._modelClass && window.Store.Chat._modelClass.prototype) {
        try {
            const chatProto = window.Store.Chat._modelClass.prototype;
            const origContactDesc = Object.getOwnPropertyDescriptor(chatProto, 'contact');
            if (origContactDesc && typeof origContactDesc.get === 'function') {
                const origContactGet = origContactDesc.get;
                Object.defineProperty(chatProto, 'contact', {
                    get: function() {
                        let c;
                        try { c = origContactGet.apply(this); } catch (_) {}
                        if (c && c.id) return c;
                        return (window.Store.Contact && window.Store.Contact.get ? window.Store.Contact.get(this.id) : null) || createSyntheticContact(this.id, window.Store.Contact);
                    },
                    configurable: true,
                    enumerable: true
                });
            }
        } catch (_) {}
    }

    /**
     * Guard FindOrCreateChat.findOrCreateLatestChat fallback
     */
    if (window.Store.FindOrCreateChat && typeof window.Store.FindOrCreateChat.findOrCreateLatestChat === 'function') {
        const origFindOrCreate = window.Store.FindOrCreateChat.findOrCreateLatestChat.bind(window.Store.FindOrCreateChat);
        window.Store.FindOrCreateChat.findOrCreateLatestChat = async function(wid) {
            try {
                if (window.Store.Contact) {
                    window.Store.Contact.get(wid);
                }
            } catch (_) {}

            try {
                return await origFindOrCreate(wid);
            } catch (err) {
                console.warn('[WWebJS] findOrCreateLatestChat orig threw:', err?.message || err, '- constructing robust fallback');
                let chat = window.Store.Chat && window.Store.Chat.get ? window.Store.Chat.get(wid) : null;
                if (!chat && window.Store.Chat && window.Store.Chat.find) {
                    try { chat = await window.Store.Chat.find(wid); } catch (_) {}
                }
                if (!chat) {
                    try {
                        if (window.Store.Chat && window.Store.Chat._modelClass) {
                            const newChat = new window.Store.Chat._modelClass({ id: wid });
                            if (window.Store.Chat.add) window.Store.Chat.add(newChat);
                            chat = window.Store.Chat.get(wid) || newChat;
                        } else if (window.Store.Chat && typeof window.Store.Chat.gadd === 'function') {
                            chat = window.Store.Chat.gadd({ id: wid }, { silent: true });
                        }
                    } catch (_) {}
                }
                if (chat) {
                    if (!chat.msgs) {
                        try {
                            if (window.Store.MsgCollection) {
                                chat.msgs = new window.Store.MsgCollection({ chat });
                            }
                        } catch (_) {}
                    }
                    return { chat };
                }
                throw err;
            }
        };
    }

    // Do NOT stub window.Store.Chat._find = e => ({ id: e }). A real chat model must have .msgs.

    window.injectToFunction = (target, callback) => {
        try {
            let module = safeReq(target.module);
            if (!module) return; 

            const path = target.function.split('.');
            const funcName = path.pop();

            for (const key of path) {
                if (!module[key]) return;
                module = module[key];
            }

            const originalFunction = module[funcName];
            if (typeof originalFunction !== 'function') return;

            module[funcName] = (...args) => {
                try {
                    return callback(originalFunction, ...args);
                } catch {
                    return originalFunction(...args);
                }
            };

        } catch {
            return;
        }
    };

    window.injectToFunction({ module: 'WAWebBackendJobsCommon', function: 'mediaTypeFromProtobuf' }, (func, ...args) => { const [proto] = args; return proto.locationMessage ? null : func(...args); });

    window.injectToFunction({ module: 'WAWebE2EProtoUtils', function: 'typeAttributeFromProtobuf' }, (func, ...args) => { const [proto] = args; return proto.locationMessage || proto.groupInviteMessage ? 'text' : func(...args); });
};
`;

    fs.writeFileSync(storePath, patchedStore, 'utf8');
    console.log('[patch-wwebjs] Successfully patched Store.js with V6 prototype-level guards & synthetic contacts.');
    return true;
}

function patchUtils() {
    const utilsPath = path.join(__dirname, 'node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Utils.js');
    if (!fs.existsSync(utilsPath)) {
        console.log('[patch-wwebjs] Utils.js not found at:', utilsPath);
        return false;
    }

    let content = fs.readFileSync(utilsPath, 'utf8');

    // 1. Patch isChannel and isStatus in sendMessage
    const targetChannelStatus = `        const isChannel = window.Store.ChatGetters.getIsNewsletter(chat);\n        const isStatus = window.Store.ChatGetters.getIsBroadcast(chat);`;
    const safeChannelStatus = `        const isChannel = Boolean(chat && chat.id && window.Store.ChatGetters && typeof window.Store.ChatGetters.getIsNewsletter === 'function' && window.Store.ChatGetters.getIsNewsletter(chat));\n        const isStatus = Boolean(chat && chat.id && window.Store.ChatGetters && typeof window.Store.ChatGetters.getIsBroadcast === 'function' && window.Store.ChatGetters.getIsBroadcast(chat));`;

    if (content.includes(targetChannelStatus)) {
        content = content.replace(targetChannelStatus, safeChannelStatus);
        console.log('[patch-wwebjs] Patched isChannel/isStatus in Utils.js sendMessage.');
    }

    // 2. Patch 'from' resolution in sendMessage to prevent undefined from/MsgKey
    const targetFrom = `        const lidUser = window.Store.User.getMaybeMeLidUser();\n        const meUser = window.Store.User.getMaybeMePnUser();\n        const newId = await window.Store.MsgKey.newId();\n        let from = chat.id.isLid() ? lidUser : meUser;\n        let participant;\n\n        if (typeof chat.id?.isGroup === 'function' && chat.id.isGroup()) {\n            from = chat.groupMetadata && chat.groupMetadata.isLidAddressingMode ? lidUser : meUser;\n            participant = window.Store.WidFactory.asUserWidOrThrow(from);\n        }\n\n        if (typeof chat.id?.isStatus === 'function' && chat.id.isStatus()) {\n            participant = window.Store.WidFactory.asUserWidOrThrow(from);\n        }`;

    const safeFrom = `        const lidUser = (window.Store.User && typeof window.Store.User.getMaybeMeLidUser === 'function') ? window.Store.User.getMaybeMeLidUser() : null;\n        const meUser = (window.Store.User && typeof window.Store.User.getMaybeMePnUser === 'function') ? window.Store.User.getMaybeMePnUser() : null;\n        const connMe = window.Store.Conn ? (window.Store.Conn.wid || window.Store.Conn.me) : null;\n        const fallbackMe = meUser || (window.Store.User && typeof window.Store.User.getMeUser === 'function' && window.Store.User.getMeUser()) || connMe || lidUser;\n        const newId = await window.Store.MsgKey.newId();\n        const isChatLid = Boolean(chat && chat.id && typeof chat.id.isLid === 'function' && chat.id.isLid());\n        let from = (isChatLid && lidUser) ? lidUser : fallbackMe;\n        if (!from) from = lidUser || fallbackMe;\n        let participant;\n\n        if (typeof chat.id?.isGroup === 'function' && chat.id.isGroup()) {\n            from = chat.groupMetadata && chat.groupMetadata.isLidAddressingMode ? (lidUser || fallbackMe) : fallbackMe;\n            if (from && window.Store.WidFactory && typeof window.Store.WidFactory.asUserWidOrThrow === 'function') {\n                try { participant = window.Store.WidFactory.asUserWidOrThrow(from); } catch (_) {}\n            }\n        }\n\n        if (typeof chat.id?.isStatus === 'function' && chat.id.isStatus()) {\n            if (from && window.Store.WidFactory && typeof window.Store.WidFactory.asUserWidOrThrow === 'function') {\n                try { participant = window.Store.WidFactory.asUserWidOrThrow(from); } catch (_) {}\n            }\n        }`;

    if (content.includes(targetFrom)) {
        content = content.replace(targetFrom, safeFrom);
        console.log('[patch-wwebjs] Patched sender "from" resolution in Utils.js sendMessage.');
    }

    // 3. Patch ephemeralFields in sendMessage
    const targetEphemeral = `        const ephemeralFields = window.Store.EphemeralFields.getEphemeralFields(chat);`;
    const safeEphemeral = `        let ephemeralFields = {};\n        try {\n            if (window.Store.EphemeralFields && typeof window.Store.EphemeralFields.getEphemeralFields === 'function' && chat && chat.id) {\n                ephemeralFields = window.Store.EphemeralFields.getEphemeralFields(chat) || {};\n            }\n        } catch (_) {\n            ephemeralFields = {};\n        }`;

    if (content.includes(targetEphemeral)) {
        content = content.replace(targetEphemeral, safeEphemeral);
        console.log('[patch-wwebjs] Patched ephemeralFields in Utils.js sendMessage.');
    }

    // 4. Patch sendSeen in Utils.js
    const targetSendSeen = `    window.WWebJS.sendSeen = async (chatId) => {\n        const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });\n        if (chat) {\n            window.Store.WAWebStreamModel.Stream.markAvailable();\n            await window.Store.SendSeen.sendSeen({\n                chat: chat,\n                threadId: undefined\n            });         \n            window.Store.WAWebStreamModel.Stream.markUnavailable();\n            return true;\n        }\n        return false;\n    };`;
    const safeSendSeen = `    window.WWebJS.sendSeen = async (chatId) => {\n        try {\n            const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });\n            if (chat && window.Store.SendSeen && window.Store.SendSeen.sendSeen) {\n                if (window.Store.WAWebStreamModel && window.Store.WAWebStreamModel.Stream) {\n                    window.Store.WAWebStreamModel.Stream.markAvailable();\n                }\n                await window.Store.SendSeen.sendSeen({\n                    chat: chat,\n                    threadId: undefined\n                });         \n                if (window.Store.WAWebStreamModel && window.Store.WAWebStreamModel.Stream) {\n                    window.Store.WAWebStreamModel.Stream.markUnavailable();\n                }\n                return true;\n            }\n        } catch (_) {}\n        return false;\n    };`;

    if (content.includes(targetSendSeen)) {
        content = content.replace(targetSendSeen, safeSendSeen);
        console.log('[patch-wwebjs] Patched sendSeen in Utils.js.');
    }

    // 5. Patch addAndSendMsgToChat execution in sendMessage to set chat.contact & safely handle memoize errors
    const safeAddAndSend = `        if (chat && !chat.contact) {
            try {
                chat.contact = (window.Store.Contact && window.Store.Contact.get(chat.id)) || (window.WWebJS && window.WWebJS.createSyntheticContact && window.WWebJS.createSyntheticContact(chat.id, window.Store.Contact));
            } catch (_) {}
        }

        let msgPromise, sendMsgResultPromise;
        try {
            [msgPromise, sendMsgResultPromise] = window.Store.SendMessage.addAndSendMsgToChat(chat, message);
        } catch (addErr) {
            if (addErr && addErr.message && (addErr.message.includes('memoize') || addErr.message.includes('id property') || addErr.message.includes('getter'))) {
                console.warn('[WWebJS] addAndSendMsgToChat caught memoize error, pre-seeding contact and retrying...', addErr.message);
                try {
                    if (window.Store.Contact && typeof window.Store.Contact.gadd === 'function') {
                        window.Store.Contact.gadd({ id: chat.id, phoneNumber: chat.id }, { silent: true });
                    }
                } catch (_) {}
                [msgPromise, sendMsgResultPromise] = window.Store.SendMessage.addAndSendMsgToChat(chat, message);
            } else {
                throw addErr;
            }
        }

        let resMsg = await msgPromise;

        if (options.waitUntilMsgSent) {
            await sendMsgResultPromise;
        }

        let sentMsg = (window.Store.Msg && typeof window.Store.Msg.get === 'function')
            ? window.Store.Msg.get(newMsgKey._serialized)
            : null;
        if (!sentMsg) sentMsg = resMsg;
        if (!sentMsg) sentMsg = message;

        return sentMsg;`;

    // Check if already cleanly patched
    if (content.includes('let sentMsg = (window.Store.Msg && typeof window.Store.Msg.get === \'function\')') &&
        content.includes('[msgPromise, sendMsgResultPromise] = window.Store.SendMessage.addAndSendMsgToChat(chat, message);')) {
        console.log('[patch-wwebjs] addAndSendMsgToChat is already cleanly patched in Utils.js.');
    } else {
        // Regex matching any previous/broken/original implementation of the final send block in sendMessage
        const sendBlockRegex = /(?:[ \t]*if \(chat && !chat\.contact\) \{[\s\S]*?return sentMsg;)|(?:[ \t]*const \[msgPromise, sendMsgResultPromise\] = window\.Store\.SendMessage\.addAndSendMsgToChat[\s\S]*?return (?:window\.Store\.Msg\.get\(newMsgKey\._serialized\)|sentMsg);)|(?:[ \t]*if \(!sentMsg\) sentMsg = resMsg;[\s\S]*?return sentMsg;)/m;
        if (sendBlockRegex.test(content)) {
            content = content.replace(sendBlockRegex, safeAddAndSend);
            console.log('[patch-wwebjs] Patched addAndSendMsgToChat cleanly in Utils.js.');
        } else {
            console.warn('[patch-wwebjs] Could not find target send block to patch in Utils.js');
        }
    }

    // 6. Patch getContactModel in Utils.js: wrap all 14 ContactMethods getters with safeGetter fallbacks
    const targetContactModelRegex = /window\.WWebJS\.getContactModel = contact => \{[\s\S]*?return res;\s*\};/m;
    const safeContactModel = `window.WWebJS.getContactModel = contact => {
        if (!contact) return null;
        let res = {};
        try {
            res = typeof contact.serialize === 'function' ? contact.serialize() : { ...contact };
        } catch (_) {
            res = { id: contact.id };
        }
        res.isBusiness = contact.isBusiness === undefined ? false : Boolean(contact.isBusiness);

        if (contact.businessProfile && typeof contact.businessProfile.serialize === 'function') {
            try { res.businessProfile = contact.businessProfile.serialize(); } catch (_) {}
        }

        const safeGetter = (getterName, fallback) => {
            try {
                if (window.Store && window.Store.ContactMethods && typeof window.Store.ContactMethods[getterName] === 'function') {
                    return window.Store.ContactMethods[getterName](contact);
                }
            } catch (_) {}
            return fallback;
        };

        res.isMe = safeGetter('getIsMe', false);
        res.isUser = safeGetter('getIsUser', true);
        res.isGroup = safeGetter('getIsGroup', false);
        res.isWAContact = safeGetter('getIsWAContact', false);
        res.isMyContact = safeGetter('getIsMyContact', false);
        res.isBlocked = Boolean(contact.isContactBlocked);
        res.userid = safeGetter('getUserid', contact.userid || (contact.id && contact.id.user) || '');
        res.isEnterprise = safeGetter('getIsEnterprise', false);
        res.verifiedName = safeGetter('getVerifiedName', '');
        res.verifiedLevel = safeGetter('getVerifiedLevel', 0);
        res.statusMute = safeGetter('getStatusMute', false);
        res.name = safeGetter('getName', contact.name || '');
        res.shortName = safeGetter('getShortName', contact.shortName || '');
        res.pushname = safeGetter('getPushname', contact.pushname || '');

        return res;
    };`;

    if (targetContactModelRegex.test(content)) {
        content = content.replace(targetContactModelRegex, safeContactModel);
        console.log('[patch-wwebjs] Patched getContactModel with safeGetter fallbacks in Utils.js.');
    }

    // 7. Patch getContact in Utils.js: never overwrite contact.id with undefined!
    const targetGetContactOrig = `        let contact = await window.Store.Contact.find(wid);\n        if (contact.id._serialized.endsWith('@lid')) {\n            contact.id = contact.phoneNumber;\n        }`;
    const safeGetContact = `        let contact = await window.Store.Contact.find(wid);\n        if (contact && contact.id && contact.id._serialized && contact.id._serialized.endsWith('@lid')) {\n            if (contact.phoneNumber) contact.id = contact.phoneNumber;\n        }`;

    if (content.includes(targetGetContactOrig)) {
        content = content.replace(targetGetContactOrig, safeGetContact);
        console.log('[patch-wwebjs] Patched getContact LID phone number check in Utils.js.');
    }

    // 8. Patch getChat fallback in Utils.js to validate chat.msgs
    const targetGetChatOrig = `        } else {\n            chat = window.Store.Chat.get(chatWid) || (await window.Store.FindOrCreateChat.findOrCreateLatestChat(chatWid))?.chat;\n        }`;
    const safeGetChat = `        } else {\n            try {\n                chat = window.Store.Chat.get(chatWid);\n            } catch (_) {}\n            if (!chat || !chat.msgs) {\n                try {\n                    if (window.Store.Contact && typeof window.Store.Contact.gadd === 'function') {\n                        window.Store.Contact.gadd(chatWid, { silent: true });\n                    }\n                    if (window.Store.Contact && typeof window.Store.Contact.find === 'function') {\n                        await window.Store.Contact.find(chatWid).catch(() => {});\n                    }\n                } catch (_) {}\n                try {\n                    if (window.Store.FindOrCreateChat && typeof window.Store.FindOrCreateChat.findOrCreateLatestChat === 'function') {\n                        const res = await window.Store.FindOrCreateChat.findOrCreateLatestChat(chatWid);\n                        const foundChat = res ? (res.chat || res) : null;\n                        if (foundChat && foundChat.msgs) chat = foundChat;\n                    }\n                } catch (err) {\n                    console.warn('[WWebJS] findOrCreateLatestChat fallback:', err?.message || err);\n                }\n            }\n            if (!chat || !chat.msgs) {\n                try {\n                    const c = window.Store.Chat.get(chatWid);\n                    if (c && c.msgs) chat = c;\n                } catch (_) {}\n            }\n            if (!chat || !chat.msgs) {\n                try {\n                    if (window.Store.Chat && typeof window.Store.Chat.find === 'function') {\n                        const c = await window.Store.Chat.find(chatWid);\n                        if (c && c.msgs) chat = c;\n                    }\n                } catch (_) {}\n            }\n            if (!chat || !chat.msgs) {\n                try {\n                    if (window.Store.Chat && window.Store.Chat._modelClass) {\n                        const newChat = new window.Store.Chat._modelClass({ id: chatWid });\n                        if (window.Store.Chat.add) window.Store.Chat.add(newChat);\n                        const c = window.Store.Chat.get(chatWid) || newChat;\n                        if (c && c.msgs) chat = c;\n                    } else if (window.Store.Chat && typeof window.Store.Chat.gadd === 'function') {\n                        const c = window.Store.Chat.gadd({ id: chatWid }, { silent: true });\n                        if (c && c.msgs) chat = c;\n                    }\n                } catch (_) {}\n            }\n        }\n\n        if (chat && !chat.msgs) {\n            chat = null;\n        }`;

    if (content.includes(targetGetChatOrig)) {
        content = content.replace(targetGetChatOrig, safeGetChat);
        console.log('[patch-wwebjs] Patched original getChat in Utils.js.');
    } else if (content.includes('findOrCreateLatestChat fallback:')) {
        const existingGetChatRegex = /} else \{\s*try \{\s*chat = window\.Store\.Chat\.get\(chatWid\);[\s\S]*?return getAsModel && chat/m;
        if (existingGetChatRegex.test(content)) {
            content = content.replace(existingGetChatRegex, `${safeGetChat}\n\n        return getAsModel && chat`);
            console.log('[patch-wwebjs] Updated existing getChat with chat.msgs validation in Utils.js.');
        }
    }

    // 9. Patch getMessageModel in Utils.js
    const targetMsgModel = `    window.WWebJS.getMessageModel = (message) => {\n        const msg = message.serialize();`;
    const safeMsgModel = `    window.WWebJS.getMessageModel = (message) => {\n        if (!message) return null;\n        let msg;\n        try {\n            msg = typeof message.serialize === 'function' ? message.serialize() : message;\n        } catch (_) {\n            msg = {\n                id: message.id || {},\n                ack: message.ack || 0,\n                body: message.body || '',\n                from: message.from,\n                to: message.to,\n                type: message.type || 'chat',\n                t: message.t || parseInt(Date.now() / 1000)\n            };\n        }\n        if (!msg || typeof msg !== 'object') return msg;`;

    if (content.includes(targetMsgModel)) {
        content = content.replace(targetMsgModel, safeMsgModel);
        console.log('[patch-wwebjs] Patched getMessageModel with safe fallback in Utils.js.');
    }

    fs.writeFileSync(utilsPath, content, 'utf8');
    return true;
}

function patchClient() {
    const clientPath = path.join(__dirname, 'node_modules', 'whatsapp-web.js', 'src', 'Client.js');
    if (!fs.existsSync(clientPath)) {
        console.log('[patch-wwebjs] Client.js not found at:', clientPath);
        return false;
    }

    let content = fs.readFileSync(clientPath, 'utf8');

    // Patch ClientInfo construction to be resilient
    const targetInfo = `this.info = new ClientInfo(this, await this.pupPage.evaluate(() => {
                            return { ...window.Store.Conn.serialize(), wid: window.Store.User.getMaybeMePnUser() || window.Store.User.getMaybeMeLidUser() };
                        }));`;

    const safeInfo = `this.info = new ClientInfo(this, await this.pupPage.evaluate(() => {
                            const connData = (window.Store && window.Store.Conn && typeof window.Store.Conn.serialize === 'function')
                                ? window.Store.Conn.serialize()
                                : {};
                            const user = window.Store && window.Store.User;
                            const wid = user ? ((typeof user.getMaybeMePnUser === 'function' && user.getMaybeMePnUser()) || (typeof user.getMaybeMeLidUser === 'function' && user.getMaybeMeLidUser()) || null) : null;
                            return { ...connData, wid };
                        }));`;

    if (content.includes(targetInfo)) {
        content = content.replace(targetInfo, safeInfo);
        console.log('[patch-wwebjs] Patched ClientInfo instantiation.');
    }

    // Patch post-auth loop fallback for attempt 15+
    const targetCatch = `console.log(\`[WWebJS] Waiting for post-auth navigation to settle (attempt \${attempt}/20): \${err?.message || err}\`);
                    await new Promise(r => setTimeout(r, 1500));`;

    const safeCatch = `console.log(\`[WWebJS] Waiting for post-auth navigation to settle (attempt \${attempt}/20): \${err?.message || err}\`);
                    if (attempt >= 10) {
                        try {
                            const isUiReady = await this.pupPage.evaluate(() => {
                                return !!(document.querySelector('#pane-side') || document.querySelector('[data-testid="chat-list"]'));
                            }).catch(() => false);
                            if (isUiReady) {
                                console.log('[WWebJS] UI confirmed open in Chromium! Forcing READY event.');
                                this.emit(Events.READY);
                                this.authStrategy.afterAuthReady();
                                break;
                            }
                        } catch (_) {}
                    }
                    await new Promise(r => setTimeout(r, 1500));`;

    if (content.includes(targetCatch)) {
        content = content.replace(targetCatch, safeCatch);
        console.log('[patch-wwebjs] Patched post-auth loop retry fallback.');
    }

    // Patch storage persistence and permissions
    const targetInit = `this.pupBrowser = browser;\n        this.pupPage = page;`;
    const safeInit = `this.pupBrowser = browser;\n        this.pupPage = page;\n\n        try {\n            const context = browser.defaultBrowserContext();\n            await context.overridePermissions('https://web.whatsapp.com', [\n                'persistent-storage',\n                'notifications',\n                'clipboard-read',\n                'clipboard-write'\n            ]);\n        } catch (_) {}\n\n        await page.evaluateOnNewDocument(() => {\n            try {\n                if (navigator.storage) {\n                    navigator.storage.persist = async () => true;\n                    navigator.storage.persisted = async () => true;\n                }\n            } catch (_) {}\n        });`;

    if (content.includes(targetInit) && !content.includes('overridePermissions')) {
        content = content.replace(targetInit, safeInit);
        console.log('[patch-wwebjs] Patched persistent-storage permissions and navigator.storage.persist.');
    }

    // Patch spurious logout during QR/sync handshake
    const targetNavLogout = `if(frame.url().includes('post_logout=1') || this.lastLoggedOut) {`;
    const safeNavLogout = `const isRealLogout = frame.url().includes('post_logout=1') || (this.lastLoggedOut && this.info && this.info.wid);\n            if(isRealLogout) {`;

    if (content.includes(targetNavLogout)) {
        content = content.replace(targetNavLogout, safeNavLogout);
        console.log('[patch-wwebjs] Patched framenavigated logout guard to prevent premature session wipe.');
    }

    // Robust sendMessage implementation: Never swallow errors, pre-seed contact, validate chat.msgs, guaranteed message return
    const robustSendMessageRegex = /const sentMsg = await this\.pupPage\.evaluate\(async \(chatId, content, options, sendSeen\) => \{[\s\S]*?return (?:sentMsg\s*\?\s*)?new Message\(this, sentMsg\)(?:\s*:\s*undefined)?;/m;

    const robustSendMessageReplacement = `const sentMsg = await this.pupPage.evaluate(async (chatId, content, options, sendSeen) => {
            const chatWid = window.Store.WidFactory.createWid(chatId);

            // Pre-seed recipient in window.Store.Contact to satisfy WhatsApp Web memoize getters
            try {
                if (window.Store.Contact) {
                    let contact = window.Store.Contact.get(chatWid);
                    if (!contact && window.Store.Contact._modelClass) {
                        contact = new window.Store.Contact._modelClass({ id: chatWid, phoneNumber: chatWid });
                        if (window.Store.Contact.add) window.Store.Contact.add(contact);
                    }
                    if (!contact && typeof window.Store.Contact.gadd === 'function') {
                        window.Store.Contact.gadd({ id: chatWid, phoneNumber: chatWid }, { silent: true });
                    }
                }
            } catch (_) {}

            let chat = await window.WWebJS.getChat(chatId, { getAsModel: false });

            if (!chat || !chat.msgs) {
                try {
                    if (window.Store.FindOrCreateChat && typeof window.Store.FindOrCreateChat.findOrCreateLatestChat === 'function') {
                        const res = await window.Store.FindOrCreateChat.findOrCreateLatestChat(chatWid);
                        const c = res ? (res.chat || res) : null;
                        if (c) chat = c;
                    }
                } catch (_) {}
            }

            if (!chat) {
                try {
                    if (window.Store.Chat && window.Store.Chat._modelClass) {
                        const newChat = new window.Store.Chat._modelClass({ id: chatWid });
                        if (window.Store.Chat.add) window.Store.Chat.add(newChat);
                        chat = window.Store.Chat.get(chatWid) || newChat;
                    } else if (window.Store.Chat && typeof window.Store.Chat.gadd === 'function') {
                        chat = window.Store.Chat.gadd({ id: chatWid }, { silent: true });
                    }
                } catch (_) {}
            }

            if (!chat) {
                throw new Error(\`Chat could not be loaded or created for recipient: \${chatId}\`);
            }

            if (sendSeen) {
                try { await window.WWebJS.sendSeen(chatId); } catch (_) {}
            }

            const msg = await window.WWebJS.sendMessage(chat, content, options);
            if (!msg) {
                throw new Error(\`Message was rejected or returned empty from WhatsApp Web for \${chatId}\`);
            }

            let msgModel = null;
            try {
                msgModel = window.WWebJS.getMessageModel(msg);
            } catch (_) {}

            if (!msgModel) {
                msgModel = {
                    id: (msg && msg.id) ? msg.id : { _serialized: \`\${chatId}_\${Date.now()}\` },
                    ack: 1,
                    body: typeof content === 'string' ? content : '',
                    to: chatId,
                    from: (window.Store.User && typeof window.Store.User.getMeUser === 'function') ? window.Store.User.getMeUser() : '',
                    type: 'chat',
                    t: Math.floor(Date.now() / 1000)
                };
            }
            return msgModel;
        }, chatId, content, internalOptions, sendSeen);

        if (!sentMsg) {
            throw new Error(\`Message dispatch to \${chatId} produced no result\`);
        }

        return new Message(this, sentMsg);`;

    if (robustSendMessageRegex.test(content)) {
        content = content.replace(robustSendMessageRegex, robustSendMessageReplacement);
        console.log('[patch-wwebjs] Patched sendMessage in Client.js with robust error propagation and chat validation.');
    }

    fs.writeFileSync(clientPath, content, 'utf8');
    return true;
}

patchStore();
patchUtils();
patchClient();
console.log('[patch-wwebjs] Completed all patches.');
