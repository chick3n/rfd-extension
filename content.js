const constants = {
    rowSelector: 'li.row.topic',
    topicSelector: 'h3.topictitle',
    decorateContainerSelector: 'div.thread_meta_large_primary',
    topicTitleSelector: 'a.topic_title_link',

    /*** IndexedDB ***/
    dbName: 'rfdExtensions',
    ignoredTopicsObjectStore: 'ignoredTopics',
    indexUrl: 'urlIndex',
}

function ObjectStore(name, indexes) {
    this.name = name;
    this.indexes = indexes;
}

ObjectStore.prototype.GetStore = function(dbRequest) {
    const db = {};
    db.result = dbRequest.result;
    db.tx = db.result.transaction([this.name], "readwrite");
    db.store = db.tx.objectStore(this.name);
    if(this.indexes) {
        db.indexes = {};
        this.indexes.forEach(index => {
            db[index] = db.store.index(index);
        })
    }

    return db;
}

ObjectStore.prototype.Insert = function(id, data) {
    const dbRequest = openIndexedDB();
    const that = this;

    dbRequest.onsuccess = function() {
        const db = that.GetStore(dbRequest);
        db.store.put({id: id, data: data});

        db.tx.onsuccess = function() {
            db.result.close();
        }
    }

    return true;
}

ObjectStore.prototype.Get = function(id, callback) {
    this.Query(id, null, callback);
}

ObjectStore.prototype.Find = function(query, callback) {
    this.Query(null, query, callback);
}

ObjectStore.prototype.Query = function(keyPath, query, callback) {
    const dbRequest = openIndexedDB();
    const that = this;

    dbRequest.onsuccess = function() {
        const db = that.GetStore(dbRequest);

        let objects;
        if(keyPath) {
            objects = db.store.get(keyPath);
        } else {
            objects = db.index.get(query);
        }

        objects.onsuccess = function() {
            const results = objects.result ? objects.result.data : null;
            callback(results);
        }

        db.tx.oncomplete = function() {
            db.result.close();
        }
    }

    return true;
}

function openIndexedDB() {
    const dbRequest = indexedDB.open(constants.dbName, 1);
    dbRequest.onerror = event => {
        console.log("Failed to open RFD Extensions DB. Error code: " + event.target.errorCode);
    }

    dbRequest.onupgradeneeded = (event) => {
        const db = event.target.result;
        const objectStore = db.createObjectStore(constants.ignoredTopicsObjectStore, { keyPath: "id" });
        objectStore.createIndex(constants.indexUrl, "url", { unique: false });        
    }

    return dbRequest;
}


function decorate(topics) {
    if(!topics)
        return;

    for(let topic of Object.values(topics)) {
        const parent = topic.node.parentElement;
        const decoratorContainer = parent.querySelector(constants.decorateContainerSelector);
        if(decoratorContainer)  {
            decoratorContainer.insertBefore(createDecoratorNode(topic), decoratorContainer.firstChild);
            //decoratorContainer.appendChild(createDecoratorNode(topic));
        }
        
        TopicsIgnoredContext.Get(topic.id, function(entry) {
            if(entry) {
                //console.log("Hide " + topic.id);
                hide(topic);
            }
        });
    }
}

function hide(topic) {
    rfd.hidden.push(topic);
    //document.querySelector('li[data-thread-id="' + topic.id + '"]').hidden = true;
    if(topic && topic.row) {
        topic.row.hidden = true;
    }
}

function unhide(topic) {
    const hiddenTopic = document.querySelector('li[data-thread-id="' + topic.id + '"]');
    if(hiddenTopic) {
        hiddenTopic.classList.add('ignored');
        hiddenTopic.hidden = false;
    }
}

function createDecoratorNode(topic) {
    const container = document.createElement('span');
    const ignoreElement = document.createElement('a');
    ignoreElement.appendChild(document.createTextNode('ignore'));
    ignoreElement.onclick = function() {
        ignore(topic);
    };
    container.className = "ignore-topic";
    container.appendChild(ignoreElement);
    return container;
}

function ignoreAll() {
    if(rfd.topics) {
        rfd.topics.forEach(topic => {
            ignore(topic);
        })
    }
}

function ignore(topic) {
    //console.log("ignore " + topic.id);
    hide(topic)
    TopicsIgnoredContext.Insert(topic.id, {url: topic.url, title: topic.title});
}

function showIgnored() {
    if(rfd && rfd.hidden) {
        rfd.hidden.forEach(topic => {
            unhide(topic);
        });
    }
}

function getUrlId(url) {
    if(!url)
        return null;

    const i = url.split('-');
    const id = i[i.length-1].replace('/', '');
    
    return id;
}

function createItem(topicNode) {
    if(!topicNode) {
        return null;
    }

    const id = getUrlId(topicNode.attributes.href.value);
    if(!id) {
        return null;
    }

    return {
        id: id,
        url: topicNode.attributes.href.value,
        title: topicNode.innerText
    };
}

function getTopics(dom) {
    dom = dom || document;
    const rows = dom.querySelectorAll(constants.rowSelector);
    const items = {};
    rows.forEach(row => {
        const topic = row.querySelector(constants.topicSelector);
        const hrefNode = topic.querySelector(constants.topicTitleSelector);
        const itemObj = createItem(hrefNode);
        itemObj.node = topic;
        itemObj.rowNode = row;

        if(itemObj) {
            items[itemObj.id] = itemObj;
        }
    });

    return items;
}

function createToolbarItem(name, callback) {
    const item = document.createElement('li');
    item.className = 'toolbar-item';

    const link = document.createElement('a');
    link.appendChild(document.createTextNode(name));
    link.onclick = callback;
    
    item.appendChild(link);

    return item;
}

function injectToolbar() {
    const toolbar = document.createElement('ul');
    toolbar.className = 'toolbar';

    let button = createToolbarItem('Ignore All', ignoreAll);
    toolbar.appendChild(button);

    button = createToolbarItem('Show Hidden', showIgnored);
    toolbar.appendChild(button);

    document.body.appendChild(toolbar);
    
    window.addEventListener('scroll', function() {
        const position = 92;
        if(window.pageYOffset > 92)
            toolbar.classList.add('sticky');
        else toolbar.classList.remove('sticky');
    });
}

function setNextPage(dom) {
    dom = dom || document;
    const nextPage = dom.querySelector('a.pagination_next');
    if(nextPage) {
        rfd.nextPage = nextPage.attributes.href.value;
        return;
    }

    rfd.nextPage = null;
}

function injectInfiniteScrolling() {
    setNextPage(document);
    document.querySelectorAll('nav.site_pagination_forums.pagination_default_forums')
        .forEach(node => {
            node.style.display = 'none';
        });
    infiniteScrolling();
}

function infiniteScrolling() {
    if(rfd.infiniteScrollListener) {
        window.removeEventListener('scroll', rfd.infiniteScrollListener);
        rfd.infiniteScrollListener = null;
    }
    
    if(rfd.nextPage) {
        const barrier = document.querySelector('.forumbg');
        rfd.infiniteScrollListener = function() {
            if(window.pageYOffset + window.innerHeight >= barrier.offsetTop + barrier.offsetHeight) {
                window.removeEventListener('scroll', rfd.infiniteScrollListener);
                //console.log('load page', rfd.nextPage);
                loadNextPage();
            }
        };
    
        window.addEventListener('scroll', rfd.infiniteScrollListener);        
    }
}

function injectResize() {
    document.querySelector('.forumbg').addEventListener('resize', function() {
        if(rfd.infiniteScrollListener) {
            window.removeEventListener(rfd.infiniteScrollListener);
        }
        injectInfiniteScrolling();
    })
}

function injectPageDivider(number, container) {
    if(!number) {
        return;
    }

    container = container || document.querySelector('ul.topiclist.topics');
    if(container) {
        const pageBreak = document.createElement('li');
        pageBreak.classList.add('page-break');
        pageBreak.classList.add('row');
        pageBreak.classList.add('topic');

        pageBreak.appendChild(document.createTextNode('page ' + number));

        container.appendChild(pageBreak);
    }
}

function loadNextPage() {
    const request = new XMLHttpRequest();
    let pageMatches = rfd.nextPage.match(/([0-9]+)\/$/);
    let pageNumber = 'err';
    if(pageMatches && pageMatches.length >= 2) {
        pageNumber = pageMatches[1];
    }

    request.onreadystatechange = function() {
        if(request && request.readyState === XMLHttpRequest.DONE) {
            let dom = new DOMParser().parseFromString(request.responseText, 'text/html');
            if(dom) {
                rfd.nextPage = null;

                const topics = getTopics(dom);
                
                if(topics && Object.keys(topics).length > 0) {
                    decorate(topics);
                    const container = document.querySelector('ul.topiclist.topics');
                    injectPageDivider(pageNumber, container);

                    for(let id in topics) {
                        if(!(id in rfd.topics)) {
                            rfd.topics[id] = topics[id];
                            container.appendChild(topics[id].rowNode);
                        }
                    };
                }
                
                setNextPage(dom);                
                infiniteScrolling();
            }
        }
    }

    request.open('GET', rfd.nextPage, true);
    request.send();
}

const rfd = {};
rfd.hidden = [];
rfd.topics = {};
const TopicsIgnoredContext = new ObjectStore(constants.ignoredTopicsObjectStore, [constants.indexUrl]);

injectToolbar();
injectInfiniteScrolling();
injectResize();

rfd.topics = getTopics();
decorate(rfd.topics);