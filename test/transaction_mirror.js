const { Server, CacheRAM } = require('../lib');
const TransactionMirror = require('../lib/server/transaction_mirror');
const tmp = require('tmp');
const { generateCommandData, sleep, writeFileDataToCache } = require('./test_utils');
const assert = require('assert');

let cacheOpts = {
    cachePath: tmp.tmpNameSync({}).toString(),
    initialPageSize: 10 * 1024,
    growPageSize: 10 * 1024,
    minFreeBlockSize: 1024,
    persistenceOptions: {
        autosave: false
    }
};

describe("TransactionMirror", () => {

    before(async () => {
        this.sourceCache = new CacheRAM();
        this.targetCache = new CacheRAM();
        await this.sourceCache.init(cacheOpts);
        await this.targetCache.init(cacheOpts);

        this.targetServer = new Server(this.targetCache, {port: 0});
        await this.targetServer.start(err => assert(!err, `Server reported error! ${err}`));
        let opts = { host: 'localhost', port: this.targetServer.port };
        this.mirror = new TransactionMirror(opts, this.sourceCache);
        this.mirror._queueProcessDelay = 1;
    });

    it("should mirror all queued transactions to the target Cache Server", async () => {
        let fileData = [
                generateCommandData(1024, 1024),
                generateCommandData(1024, 1024)
            ];

        fileData.forEach(d => {
            writeFileDataToCache(this.sourceCache, d);
            const trxMock = { guid: d.guid, hash: d.hash, manifest: ['i', 'a', 'r'] };
            this.mirror.queueTransaction(trxMock);
        });

        await sleep(50);

        fileData.forEach(async d => {
            let info = await this.targetCache.getFileInfo('i', d.guid, d.hash);
            assert(info && info.size === d.info.length);

            info = await this.targetCache.getFileInfo('r', d.guid, d.hash);
            assert(info && info.size === d.resource.length);

            info = await this.targetCache.getFileInfo('a', d.guid, d.hash);
            assert(info && info.size === d.bin.length);
        });
    });

    describe("queueTransaction", () => {
        it("should not queue an empty transaction for mirroring", () => {
            this.mirror.queueTransaction({manifest: []});
            assert(this.mirror._queue.length === 0);
        });
    });

    describe("get address", () => {
        it("should return the address of the mirror host", () => {
            assert(this.mirror.address === "localhost");
        });
    });
});