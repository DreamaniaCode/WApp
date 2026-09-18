/**
 * patch-wwebjs.js
 * Automatically patches whatsapp-web.js to handle WhatsApp Web updates gracefully:
 * 1. Hardens Store.js:
 *    - Uses safeReq to prevent "Cannot read properties of undefined (reading 'setPushname')".
 *    - Wraps memoized getters (ChatGetters, ContactMethods, EphemeralFields, etc.) with safe fallbacks
 *      to prevent "Data passed to getter must include an id property (it's how we memoize) but got undefined".
 *    - Guards Store.Contact and Store.ContactCollection to return synthetic contact models for new/unsaved numbers.
 * 2. Hardens Utils.js:
 *    - Guards isChannel / isStatus checks in sendMessage against missing chat or missing id.
 *    - Protects ephemeralFields retrieval with try/catch.
 *    - Makes sendSeen resilient with try/catch.
 *    - Adds multi-stage fallback in getChat for findOrCreateLatestChat.
 * 3. Hardens Client.js:
 *    - Wraps sendSeen in sendMessage evaluate with try/catch.
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
    if (content.includes('wrapMemoizedGetters')) {
        console.log('[patch-wwebjs] Store.js already patched with memoized getter guards.');
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

    const wrapMemoizedGetters = (mod) => {
        if (!mod || typeof mod !== 'object') return mod;
        for (const [key, fn] of Object.entries(mod)) {
            if (typeof fn === 'function' && !fn._memoizeGuarded) {
                const origFn = fn;
                const guarded = function(...args) {
                    try {
                        const target = args[0];
                        if (args.length > 0 && (!target || typeof target !== 'object' || !target.id)) {
                            return false;
                        }
                        return origFn.apply(this, args);
                    } catch (err) {
                        if (err && err.message && err.message.includes('Data passed to getter must include an id property')) {
                            return false;
                        }
                        throw err;
                    }
                };
                guarded._memoizeGuarded = true;
                mod[key] = guarded;
            }
        }
        return mod;
    };

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
    window.Store.ContactMethods = wrapMemoizedGetters({
        ...(safeReq('WAWebContactGetters') || {}),
        ...(safeReq('WAWebFrontendContactGetters') || {})
    });
    wrapMemoizedGetters(safeReq('WAWebContactGetters'));
    wrapMemoizedGetters(safeReq('WAWebFrontendContactGetters'));
    wrapMemoizedGetters(safeReq('WAWebAddressbookContactGetters'));
    wrapMemoizedGetters(safeReq('WAWebBusinessProfileGetters'));
    wrapMemoizedGetters(safeReq('WAWebGroupGetters'));
    wrapMemoizedGetters(safeReq('WAWebEphemeralFieldsGetters'));
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
    window.Store.EphemeralFields = wrapMemoizedGetters(safeReq('WAWebGetEphemeralFieldsMsgActionsUtils'));
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
    window.Store.ChatGetters = wrapMemoizedGetters(safeReq('WAWebChatGetters'));
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

    const protectContactCollection = (col) => {
        if (!col || typeof col.get !== 'function' || col.get._guarded) return;
        const origGet = col.get.bind(col);
        const guardedGet = function(wid) {
            const existing = origGet(wid);
            if (existing) return existing;
            if (wid) {
                const serialized = typeof wid === 'string' ? wid : (wid._serialized || (typeof wid.toString === 'function' ? wid.toString() : ''));
                return {
                    id: wid,
                    userid: serialized ? serialized.split('@')[0] : '',
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
                    type: 'in'
                };
            }
            return existing;
        };
        guardedGet._guarded = true;
        col.get = guardedGet;
    };

    if (window.Store.Contact) protectContactCollection(window.Store.Contact);
    if (window.Store.ContactCollection) protectContactCollection(window.Store.ContactCollection);

    if (window.Store.FindOrCreateChat && typeof window.Store.FindOrCreateChat.findOrCreateLatestChat === 'function') {
        const origFindOrCreate = window.Store.FindOrCreateChat.findOrCreateLatestChat.bind(window.Store.FindOrCreateChat);
        window.Store.FindOrCreateChat.findOrCreateLatestChat = async function(wid) {
            try {
                return await origFindOrCreate(wid);
            } catch (err) {
                if (err && err.message && err.message.includes('Data passed to getter must include an id property')) {
                    console.warn('[WWebJS] findOrCreateLatestChat caught memoize getter error, attempting fallback chat');
                    let chat = window.Store.Chat && window.Store.Chat.get ? window.Store.Chat.get(wid) : null;
                    if (!chat && window.Store.Chat && window.Store.Chat.find) {
                        try { chat = await window.Store.Chat.find(wid); } catch (_) {}
                    }
                    if (chat) return { chat };
                }
                throw err;
            }
        };
    }

    if (window.Store.Chat && (!window.Store.Chat._find || !window.Store.Chat.findImpl)) {
        window.Store.Chat._find = e => {
            const target = window.Store.Chat.get ? window.Store.Chat.get(e) : null;
            return target ? Promise.resolve(target) : Promise.resolve({
                id: e
            });
        };
        window.Store.Chat.findImpl = window.Store.Chat._find;
    }

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
    console.log('[patch-wwebjs] Successfully patched Store.js with safeReq & memoized getter guards.');
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

    // 2. Patch ephemeralFields in sendMessage
    const targetEphemeral = `        const ephemeralFields = window.Store.EphemeralFields.getEphemeralFields(chat);`;
    const safeEphemeral = `        let ephemeralFields = {};\n        try {\n            if (window.Store.EphemeralFields && typeof window.Store.EphemeralFields.getEphemeralFields === 'function' && chat && chat.id) {\n                ephemeralFields = window.Store.EphemeralFields.getEphemeralFields(chat) || {};\n            }\n        } catch (_) {\n            ephemeralFields = {};\n        }`;

    if (content.includes(targetEphemeral)) {
        content = content.replace(targetEphemeral, safeEphemeral);
        console.log('[patch-wwebjs] Patched ephemeralFields in Utils.js sendMessage.');
    }

    // 3. Patch sendSeen in Utils.js
    const targetSendSeen = `    window.WWebJS.sendSeen = async (chatId) => {\n        const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });\n        if (chat) {\n            window.Store.WAWebStreamModel.Stream.markAvailable();\n            await window.Store.SendSeen.sendSeen({\n                chat: chat,\n                threadId: undefined\n            });         \n            window.Store.WAWebStreamModel.Stream.markUnavailable();\n            return true;\n        }\n        return false;\n    };`;
    const safeSendSeen = `    window.WWebJS.sendSeen = async (chatId) => {\n        try {\n            const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });\n            if (chat && window.Store.SendSeen && window.Store.SendSeen.sendSeen) {\n                if (window.Store.WAWebStreamModel && window.Store.WAWebStreamModel.Stream) {\n                    window.Store.WAWebStreamModel.Stream.markAvailable();\n                }\n                await window.Store.SendSeen.sendSeen({\n                    chat: chat,\n                    threadId: undefined\n                });         \n                if (window.Store.WAWebStreamModel && window.Store.WAWebStreamModel.Stream) {\n                    window.Store.WAWebStreamModel.Stream.markUnavailable();\n                }\n                return true;\n            }\n        } catch (_) {}\n        return false;\n    };`;

    if (content.includes(targetSendSeen)) {
        content = content.replace(targetSendSeen, safeSendSeen);
        console.log('[patch-wwebjs] Patched sendSeen in Utils.js.');
    }

    // 4. Patch getChat fallback in Utils.js
    const targetGetChat = `        } else {\n            chat = window.Store.Chat.get(chatWid) || (await window.Store.FindOrCreateChat.findOrCreateLatestChat(chatWid))?.chat;\n        }`;
    const safeGetChat = `        } else {\n            try {\n                chat = window.Store.Chat.get(chatWid);\n            } catch (_) {}\n            if (!chat) {\n                try {\n                    if (window.Store.FindOrCreateChat && typeof window.Store.FindOrCreateChat.findOrCreateLatestChat === 'function') {\n                        const res = await window.Store.FindOrCreateChat.findOrCreateLatestChat(chatWid);\n                        chat = res ? (res.chat || res) : null;\n                    }\n                } catch (err) {\n                    console.warn('[WWebJS] findOrCreateLatestChat fallback:', err?.message || err);\n                }\n            }\n            if (!chat) {\n                try { chat = window.Store.Chat.get(chatWid); } catch (_) {}\n            }\n            if (!chat && window.Store.Chat && typeof window.Store.Chat.find === 'function') {\n                try { chat = await window.Store.Chat.find(chatWid); } catch (_) {}\n            }\n        }`;

    if (content.includes(targetGetChat)) {
        content = content.replace(targetGetChat, safeGetChat);
        console.log('[patch-wwebjs] Patched getChat findOrCreateLatestChat in Utils.js.');
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

    // Patch sendSeen in pupPage.evaluate of sendMessage
    const targetEvalSendSeen = `if (sendSeen) {\n                await window.WWebJS.sendSeen(chatId);\n            }`;
    const safeEvalSendSeen = `if (sendSeen) {\n                try { await window.WWebJS.sendSeen(chatId); } catch (_) {}\n            }`;
    if (content.includes(targetEvalSendSeen)) {
        content = content.replace(targetEvalSendSeen, safeEvalSendSeen);
        console.log('[patch-wwebjs] Patched sendSeen try/catch in Client.js sendMessage.');
    }

    fs.writeFileSync(clientPath, content, 'utf8');
    return true;
}

patchStore();
patchUtils();
patchClient();
console.log('[patch-wwebjs] Completed all patches.');
