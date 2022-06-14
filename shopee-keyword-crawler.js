// modules
require('dotenv').config()
const argv = require('minimist')(process.argv.slice(2))

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os')
const prompt = require('prompt-sync')({ sigint: true })
const { getRandomInt, log, getDesktopPath } = require('./utils/index');

// constant
const RESULT_LINK_SELECTOR = 'div.NJo7tc.Z26q7c.jGGQ5e > div > a'
const GOOGLE_INPUT_SELECTOR = '[title="Google 搜尋"]'
const URL_KEYWORD_PARAMS_REGEXP = /keyword=(%23|%EF%BC%83){0,2}([A-Za-z0-9%]+)/
const CITE_SEARCH_FILTER = '.*search.*'
const URL_TAG_PARAMS_REGEXP = /(%23|%EF%BC%83){0,2}([A-Za-z0-9%]+)-tag/
const CITE_TAG_FILTER = '.*-tag'
const CATEGORY_SUBCATEGORY_REGEXP = /(sub)?category=([0-9]+)/g
const SHOPEE_SITE_SYNTAX = 'site:shopee.tw'
const NEXT_PAGE_SELECTOR = "#pnnext"
const PAGES = 2
const RECURSIVE_GET_INDEX = 1
// debug log switch
let DEBUG_LOG
// output file name
const OUTPUT_FILE_NAME = 'result.txt'

// result variable
const keywordSaved = new Set()
const keywordResults = []

// functions
async function doGoogleSearch(page, keyword) {
  try {
    await Promise.all([
      page.waitForNavigation(),
      page.goto('https://google.com')
    ])
    await page.waitForTimeout(getRandomInt() * 1000)
    const input = await page.$(GOOGLE_INPUT_SELECTOR);
    if (input) {
      DEBUG_LOG && log(`Google 搜尋關鍵字 : ${keyword}`)
      await input.focus();
      await input.type(keyword);
    }
    await page.waitForTimeout(getRandomInt() * 1000)

    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(getRandomInt() * 1000)
    await page.waitForSelector('#botstuff') 
  } catch (error) {
    return Promise.reject(`[doGoogleSearch] get error! ${error}`)
  }
}
async function goNextPage(page) {
  try {
    DEBUG_LOG && log(`前往下一頁`)
    await Promise.all([
      page.waitForNavigation(), // The promise resolves after navigation has finished
      page.click(NEXT_PAGE_SELECTOR), // Clicking the link will indirectly cause a navigation
    ]);
    await page.waitForTimeout(getRandomInt() * 1000)

  } catch (error) {
    return Promise.reject(`[goNextPage] get error! ${error}`)
  }
}
async function getFilteredSearchResultLinks(page) {
  try {
    const filterResults = await page.$$eval(RESULT_LINK_SELECTOR, 
      (results, searchFilter, tagFilter) => {
        return results
          .filter(e => {
            const citeText = e.querySelector('cite[role="text"] > span').innerText
            const reg_search = new RegExp(searchFilter)
            const reg_tag = new RegExp(tagFilter)
            return reg_search.test(citeText) || reg_tag.test(citeText)
          })
          .map(e => e.href)
      }, 
      CITE_SEARCH_FILTER, 
      CITE_TAG_FILTER
    )

    DEBUG_LOG && filterResults.slice().forEach((href) => {
      log(`搜尋結果 ${decodeURIComponent(href)} 匹配。`)
    })
    return filterResults
  } catch (error) {
    return Promise.reject(`[getFilteredSearchResultLinks] get error! ${error}`)
  }
}
async function getSearchResultLinks(page, keyword, pages = 2) {
  let resultLinks = []
  let count = pages
  try {
    await doGoogleSearch(page, keyword)
    DEBUG_LOG && log(`此次搜尋${pages}頁, 共${pages * 10}筆結果`)
    while(--count >= 0) {
      DEBUG_LOG && log(`現在搜尋第 ${pages - count} 頁...`)
      const results = await getFilteredSearchResultLinks(page)
      resultLinks = resultLinks.concat(results)
      if(count === 0) break
      await goNextPage(page)
    }
    return resultLinks
  } catch (error) {
    return Promise.reject(`[getSearchResultLinks] get error! ${error}`)
  }
}
function getKeyword(data) {
  switch(true) {
    case /keyword=/.test(data):
      var [, , matched] = data.match(URL_KEYWORD_PARAMS_REGEXP)
      return decodeURIComponent(matched)
    case /-tag/.test(data):
      var [, , matched] = data.match(URL_TAG_PARAMS_REGEXP)
      return decodeURIComponent(matched)
    default:
      return false
  }
}
function getCategoryAndSubCategory(data) {
  if(typeof data !== 'string') return [undefined, undefined]
  let category, subcategory
  const [matched, matched2] = data.match(CATEGORY_SUBCATEGORY_REGEXP) || []
  if(matched) {
    let [key, value] = matched.split('=');
    key === 'category' ? (category = value) : (subcategory = value)
  }
  if(matched2) {
    let [key, value] = matched2.split('=');
    key === 'category' ? (category = value) : (subcategory = value)
  }
  
  return [category, subcategory]
}
const hasCategoryAndSubCategory = data => CATEGORY_SUBCATEGORY_REGEXP.test(data)
async function recursivelyGetKeywords(page, keyword, index = 0) {
  if(index === 0) DEBUG_LOG && log(`現在是第一層 ${keyword} 關鍵字搜尋...`)
  else DEBUG_LOG && log(`現在是第二層 ${keyword} 關鍵字搜尋...`)

  let resultLinks = await getSearchResultLinks(page, `${keyword} ${SHOPEE_SITE_SYNTAX}`)

  try {
    let matchedKeywords = []
    for(let i = 0; i < resultLinks.length; i++) {
      const pageUrl = resultLinks[i]
      let matchedKeyword = getKeyword(pageUrl)
      let resultObj = {}
      if(matchedKeyword) {
        if(!keywordSaved.has(matchedKeyword)) {
          let logs = `找到關鍵字 : \x1b[33m${matchedKeyword}\x1b[0m`
          keywordSaved.add(matchedKeyword)
          if(index === 0) matchedKeywords.push(matchedKeyword)
          resultObj['keyword'] = matchedKeyword
  
          let hasSome = hasCategoryAndSubCategory(pageUrl)
          if(hasSome) {
            await Promise.all([page.waitForNavigation(), page.goto(pageUrl)]);
            await page.waitForTimeout(1500)

            const realUrl = page.url()
            let [category, subcategory] = getCategoryAndSubCategory(realUrl)
            if(category) {
              logs += ` \x1b[33m${category}\x1b[0m`
              resultObj['category'] = category
            }
            if(subcategory) {
              logs += ` \x1b[33m${subcategory}\x1b[0m`
              resultObj['subcategory'] = subcategory
            }
            await Promise.all([page.waitForNavigation(), page.goBack()]);
            await page.waitForTimeout(1500)
          }
          DEBUG_LOG && log(logs);
          keywordResults.push(resultObj);
        }
      }
      else {
        DEBUG_LOG && log(['\x1b[33m%s\x1b[0m', `[DEBUG MODE] [訊息]: 此連結沒有找到符合關鍵字(keyword或是tag): ${decodeURIComponent(pageUrl)}, 將不計入結果內`])
      }
    }

    if(index !== RECURSIVE_GET_INDEX) {
      for(let i = 0; i < matchedKeywords.length; i++) {
        await recursivelyGetKeywords(page, matchedKeywords[i], index + 1)
      }
    }
  } catch (error) {
    return Promise.reject(`[recursivelyGetKeywords] get error! ${error}`)
  }
}
function getResult(results) {
  if(!Array.isArray(results)) throw new Error('[getResult] get error! wrong input type')
  return results.reduce((result, { keyword, category, subcategory }) => {
    return result += (keyword + '\t' + (category || ' ') + '\t' + (subcategory || ' ') + '\n')
  }, '')
}
function checkHeadlessMode(is_headless_mode) {
  if(is_headless_mode !== 'y' && is_headless_mode !== 'n') {
    log('輸入錯誤，預設使用無視窗模式')
    return false
  }
  return is_headless_mode === 'y'
}
function checkDebugLog(debug_log) {
  if(debug_log !== 'y' && debug_log !== 'n') {
    log('輸入錯誤，預設為不顯示撈取過程訊息')
    return false
  }
  return debug_log === 'y'
}
function dealWithUserInput() {
  // keyword
  const input_keyword = prompt('請輸入你想撈取的關鍵字: ')
  // is headless mode
  let is_headless_mode = prompt('是否要使用無視窗模式(預設為否): 輸入 "y" or "n"', 'n')
  is_headless_mode = checkHeadlessMode(is_headless_mode)
  // output path
  let output_file_path = prompt('結果存取位置(預設為桌面): ')
  !output_file_path && (output_file_path = getDesktopPath())
  // debug log
  let debug_log = prompt('是否要觀看撈取過程訊息(預設為否): 輸入 "y" or "n"', 'n')
  debug_log = checkDebugLog(debug_log)

  return {
    input_keyword,
    is_headless_mode,
    output_file_path,
    debug_log
  }
}
function dealWithEnv() {
  let { input_keyword, is_headless_mode, output_file_path, debug_log } = process.env
  // is headless mode
  is_headless_mode = checkHeadlessMode(is_headless_mode)
  // output path
  !output_file_path && (output_file_path = getDesktopPath())
  // debug log
  debug_log = checkDebugLog(debug_log)

  return {
    input_keyword,
    is_headless_mode,
    output_file_path,
    debug_log
  }
}
async function main () {
  try {
    let INPUT_KEYWORD, IS_HEADLESS_MODE, OUTPUT_FILE_PATH, ABS_OUTPUT_PATH
    const { input_mode } = argv

    if(input_mode === 'false') {
      const { input_keyword, is_headless_mode, output_file_path, debug_log } = dealWithEnv()
      INPUT_KEYWORD = input_keyword
      IS_HEADLESS_MODE = is_headless_mode
      OUTPUT_FILE_PATH = output_file_path
      ABS_OUTPUT_PATH = path.join(output_file_path, OUTPUT_FILE_NAME)
      DEBUG_LOG = debug_log
    } else {
      const {input_keyword, is_headless_mode, output_file_path, debug_log } = dealWithUserInput()
      INPUT_KEYWORD = input_keyword
      IS_HEADLESS_MODE = is_headless_mode
      OUTPUT_FILE_PATH = output_file_path
      ABS_OUTPUT_PATH = path.join(output_file_path, OUTPUT_FILE_NAME)
      DEBUG_LOG = debug_log
    }

    log(
      `撈取的關鍵字名稱 : ${INPUT_KEYWORD}`, 
      `是否使用無視窗模式 : ${IS_HEADLESS_MODE ? `是` : `否`}`,
      `是否要觀看撈取過程訊息 : ${DEBUG_LOG ? `是` : `否`}`,
      `結果存取位置 : ${OUTPUT_FILE_PATH}`,
      `檔名為 : ${OUTPUT_FILE_NAME}`
    )

    // launch puppeteer
    const browser = await puppeteer.launch({
      headless: IS_HEADLESS_MODE, // 不使用 headless 模式，就會開啟瀏覽器來實際動作
      slowMo: 100, // 每個動作的間隔時間，方便觀察實際動作
    });
    
    // new page
    const page = await browser.newPage(); // 開啟新分頁
    await page.waitForTimeout(getRandomInt() * 1000)
    
    // get keywords
    await recursivelyGetKeywords(page, INPUT_KEYWORD, 0)
    DEBUG_LOG && log(`搜尋結束，一共找到 ${keywordSaved.size} 個關鍵字`)
    const result = getResult(keywordResults)
    
    // write file
    fs.writeFile(ABS_OUTPUT_PATH, result, (err) => {
      if(err) throw err;
      log(`已儲存檔案。檔案存放路徑: ${ABS_OUTPUT_PATH}`)
      browser.close()
      log(`執行結束。 bye bye~`)
      process.exit()
    })
  } catch (error) {
    log('程式錯誤，終止程式。\n錯誤訊息為: \n', error)
    process.exit(1)
  }
}

// main
main()