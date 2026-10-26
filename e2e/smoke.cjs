// Fluxo de ponta a ponta pela interface real (PostgREST + Postgres locais). Uso: node e2e/smoke.cjs
const { chromium } = require('playwright')
const crypto = require('node:crypto')
const fs = require('node:fs')

const SECRET = 'e2e-secret-e2e-secret-e2e-secret-123456'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function jwt(sub) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }); const exp = Math.floor(Date.now() / 1000) + 86400
  const p = b64({ sub, role: 'authenticated', aud: 'authenticated', exp })
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`
}
const USER = '00000000-0000-0000-0000-0000000000a1'
const BASE = 'http://localhost:4173'
const OUT = process.env.E2E_OUT || '/tmp/claude-0/e2e-shots'
fs.mkdirSync(OUT, { recursive: true })

const resultados = []
const passo = async (nome, fn) => {
  try { await globalThis.__fechar?.(); await fn(); resultados.push(['PASSOU', nome]); console.log('PASSOU', nome) } catch (e) { const m = String(e.message).split('\n')[0]; try { await globalThis.__falha?.(nome) } catch {} resultados.push(['FALHOU', nome + ' :: ' + m]); console.log('FALHOU', nome, '::', m) }
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true })
  const token = jwt(USER)
  await ctx.addInitScript(([t, u]) => {
    localStorage.setItem('sb-localhost-auth-token', JSON.stringify({
      access_token: t, refresh_token: 'x', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: u, aud: 'authenticated', role: 'authenticated', email: 'dono@teste.local', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    }))
  }, [token, USER])
  const page = await ctx.newPage(); page.setDefaultTimeout(8000)
  globalThis.__fechar = async () => { for (let i = 0; i < 3 && (await page.getByRole('dialog').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(150) } }
  const erros = []
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) erros.push('console: ' + m.text()) })
  globalThis.__falha = (n) => page.screenshot({ path: `${OUT}/FALHA-${n.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}.png`, fullPage: true })
  const D = () => page.getByRole('dialog').last()
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true })
  const menu = (nome) => page.getByRole('navigation').getByRole('link', { name: nome, exact: true }).click()
  const salvar = (nome = 'Salvar') => page.getByRole('dialog').getByRole('button', { name: nome, exact: true }).click()
  const toastTexto = (t) => page.getByRole('status').getByText(t).first().waitFor({ timeout: 8000 })

  await page.goto(BASE)
  await passo('Dashboard abre sem empresas (estado vazio)', async () => {
    await page.getByText('Nenhuma empresa cadastrada').waitFor({ timeout: 10000 })
    await shot('01-dashboard-vazio')
  })

  const empresas = [['Empresa Um Ltda', 'Um', '11222333000181', 'MEI'], ['Empresa Dois Ltda', 'Dois', '11444777000161', 'Simples Nacional'], ['Empresa Tres Ltda', 'Tres', '12ABC345000188', 'MEI']]
  await passo('Cadastro das três empresas pela interface', async () => {
    await menu('Empresas')
    for (const [rs, nf, cnpj, reg] of empresas) {
      await page.getByRole('button', { name: 'Nova empresa' }).click()
      await D().getByLabel('Razão social').fill(rs); await D().getByLabel('Nome fantasia').fill(nf); await D().getByLabel('CNPJ').fill(cnpj)
      await D().getByLabel('Regime tributário').selectOption(reg)
      await salvar(); await toastTexto('Empresa salva.')
    }
    await page.getByRole('cell', { name: 'Empresa Tres Ltda' }).waitFor()
    await shot('02-empresas')
  })
  await passo('CNPJ inválido é recusado no formulário', async () => {
    await page.getByRole('button', { name: 'Nova empresa' }).click()
    await D().getByLabel('Razão social').fill('X'); await D().getByLabel('CNPJ').fill('11222333000182')
    await salvar(); await page.getByText('CNPJ inválido.').waitFor()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
  })

  await passo('Cadastro de clientes (CNPJ numérico e alfanumérico)', async () => {
    await menu('Clientes')
    for (const [rs, cnpj] of [['Cliente Alfa', '12345678000195'], ['Cliente Beta', 'ABCDEFGH000195']]) {
      await page.getByRole('button', { name: 'Novo cliente' }).click()
      await D().getByLabel('Razão social').fill(rs); await D().getByLabel('CNPJ').fill(cnpj)
      await salvar(); await toastTexto('Cliente salvo.')
    }
    await page.getByRole('cell', { name: 'Cliente Beta' }).waitFor()
    await shot('03-clientes')
  })
  await passo('Cliente duplicado (outra formatação) é recusado', async () => {
    await page.getByRole('button', { name: 'Novo cliente' }).click()
    await D().getByLabel('Razão social').fill('Dup'); await D().getByLabel('CNPJ').fill('12.345.678/0001-95')
    await salvar(); await page.getByText('Já existe um cadastro com este CNPJ.').waitFor()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
  })

  const contrato = async (empresa, cliente, desc, valor, extra = {}) => {
    await page.getByRole('button', { name: 'Novo contrato' }).click()
    await D().getByLabel('Empresa responsável').selectOption({ label: empresa })
    await D().getByLabel('Cliente *').selectOption({ label: cliente })
    await D().getByLabel('Descrição do serviço').fill(desc)
    await D().getByLabel('Valor base').fill(valor)
    if (extra.per) await D().getByLabel('Periodicidade').selectOption(extra.per)
    await D().getByLabel('Dia de vencimento').fill(extra.dia ?? '10')
    await D().getByLabel('Início *').fill(extra.inicio ?? '2026-01-15')
    await salvar(); await toastTexto('Contrato salvo.')
  }
  await passo('Contratos: mensal, anual e em empresas diferentes para o mesmo cliente', async () => {
    await menu('Mensalidades')
    await contrato('Um', 'Cliente Alfa — 12.345.678/0001-95', 'Sistema de ponto', '150,00', { dia: '31' })
    await contrato('Dois', 'Cliente Alfa — 12.345.678/0001-95', 'Suporte técnico', '85,00', { dia: '5' })
    await contrato('Um', 'Cliente Beta — ' + 'AB.CDE.FGH/0001-95', 'Sistema de gestão', '1.200,00', { per: 'anual', dia: '10', inicio: '2026-03-10' })
    await page.getByRole('cell', { name: 'Sistema de ponto' }).waitFor()
    await shot('04-mensalidades')
  })
  await passo('Tabela de mensalidades tem exatamente 4 colunas', async () => {
    const n = await page.locator('table thead th').count()
    if (n !== 4) throw new Error(`colunas=${n}`)
    const cab = await page.locator('table thead th').allInnerTexts()
    if (cab.join('|').toLowerCase() !== 'razão social|cnpj|valor|descrição') throw new Error(cab.join('|'))
  })
  await passo('Detalhes do contrato abrem em painel lateral', async () => {
    await page.getByRole('cell', { name: 'Sistema de ponto' }).click()
    await page.getByRole('dialog').getByText('Histórico de valores (vigência)').waitFor()
    await page.getByRole('dialog').getByText('Empresa responsável pela cobrança').waitFor()
    await shot('05-contrato-detalhe')
  })
  await passo('Alteração de valor com vigência preserva o histórico', async () => {
    await page.getByRole('cell', { name: 'Sistema de ponto' }).click()
    await page.getByRole('button', { name: 'Alterar valor' }).click()
    await D().getByLabel('Novo valor base').fill('180,00'); await D().getByLabel('Vigente a partir de').fill('2026-12-01'); await D().getByLabel('Motivo').fill('reajuste')
    await page.getByRole('dialog').filter({ hasText: 'Alterar valor do contrato' }).getByRole('button', { name: 'Salvar' }).click()
    await toastTexto('Valor alterado')
    await page.getByRole('dialog').getByRole('cell', { name: 'R$ 180,00' }).waitFor()
    await page.keyboard.press('Escape')
  })

  await passo('Gerar cobranças da competência atual e reprocessar sem duplicar', async () => {
    await menu('Cobranças')
    await page.getByRole('button', { name: 'Gerar cobranças da competência' }).click()
    await toastTexto('2 cobrança(s) criada(s)')
    await page.getByRole('button', { name: 'Gerar cobranças da competência' }).click()
    await toastTexto('0 cobrança(s) criada(s); 2 já existiam')
    await page.getByRole('cell', { name: /Cliente Alfa/ }).first().waitFor()
    await shot('06-cobrancas')
  })
  await passo('Registrar pagamento parcial e depois a quitação', async () => {
    await page.getByRole('row', { name: /Cliente Alfa/ }).filter({ hasText: 'R$ 150,00' }).getByRole('button', { name: 'Pagamento' }).click()
    await D().getByLabel('Valor recebido').fill('50,00')
    await page.getByRole('dialog').getByRole('button', { name: 'Registrar', exact: true }).click()
    await toastTexto('Pagamento registrado.')
    await page.getByRole('row', { name: /Cliente Alfa/ }).filter({ hasText: 'R$ 150,00' }).getByText('Parcialmente paga').waitFor()
    await page.getByRole('row', { name: /Cliente Alfa/ }).filter({ hasText: 'R$ 150,00' }).getByRole('button', { name: 'Pagamento' }).click()
    if ((await D().getByLabel('Valor recebido').inputValue()) !== '100') throw new Error('saldo sugerido incorreto: ' + (await D().getByLabel('Valor recebido').inputValue()))
    await D().getByLabel('Valor recebido').fill('100,01')
    await page.getByRole('dialog').getByRole('button', { name: 'Registrar', exact: true }).click()
    await page.getByText('excede o saldo').waitFor()
    await D().getByLabel('Valor recebido').fill('100,00')
    await page.getByRole('dialog').getByRole('button', { name: 'Registrar', exact: true }).click()
    await page.getByRole('row', { name: /Cliente Alfa/ }).filter({ hasText: 'R$ 150,00' }).getByText('Paga', { exact: true }).waitFor()
  })

  await passo('Venda com múltiplos itens (total calculado) e devolução', async () => {
    await menu('Vendas')
    await page.getByRole('button', { name: 'Nova venda' }).click()
    await D().getByLabel('Empresa vendedora').selectOption({ label: 'Um' })
    await D().getByLabel('Nome do comprador').fill('Consumidor final')
    await D().getByLabel('Situação').selectOption('faturada')
    await D().getByLabel('Descrição').first().fill('Cabo'); await D().getByLabel('Quantidade').first().fill('2'); await D().getByLabel('Valor unitário').first().fill('10,50'); await D().getByLabel('Desconto').first().fill('1,00')
    await page.getByRole('button', { name: '+ Adicionar item' }).click()
    await D().getByLabel('Descrição').nth(1).fill('Fonte'); await D().getByLabel('Quantidade').nth(1).fill('3'); await D().getByLabel('Valor unitário').nth(1).fill('33,33')
    await page.getByText('Total: R$ 119,99').waitFor()
    await page.getByRole('dialog').getByRole('button', { name: 'Registrar venda' }).click(); await toastTexto('Venda registrada.')
    await page.getByRole('cell', { name: 'Consumidor final' }).click()
    await page.getByRole('dialog').getByText('R$ 119,99').first().waitFor()
    await page.getByRole('dialog').first().getByRole('button', { name: 'Registrar', exact: true }).click()
    await D().getByLabel('Valor (R$)').fill('19,99'); await D().getByRole('button', { name: 'Registrar', exact: true }).click()
    await page.getByRole('dialog').first().getByText('R$ 100,00').first().waitFor()
    await shot('07-venda')
    await page.keyboard.press('Escape')
  })

  await passo('Dashboard consolida mensalidades, vendas e mostra cobranças', async () => {
    await menu('Dashboard Master')
    await page.getByText('Faturamento do mês').waitFor()
    // mês atual: cobranças 150 (Alfa/Um) + 85 (Alfa/Dois) = 235 de mensalidades + 100 de vendas líquidas
    await page.getByText('R$ 335,00').first().waitFor({ timeout: 8000 })
    await shot('08-dashboard')
  })
  await passo('Faturamento: registros que compõem o total e estorno separado', async () => {
    await menu('Faturamento')
    await page.getByText('Registros que compõem o total').waitFor()
    await page.getByText('Devolução de venda').first().waitFor()
    await shot('09-faturamento')
  })
  await passo('Limite: configurar parâmetros individuais e ver alerta', async () => {
    await menu('Limite MEI')
    await page.getByLabel('Limite de referência').fill('300,00')
    await page.getByRole('button', { name: 'Salvar parâmetros' }).click(); await toastTexto('Parâmetros salvos')
    await page.getByText('83,33%').first().waitFor({ timeout: 8000 })
    await page.getByText('Atenção').first().waitFor()
    await shot('10-limite')
  })
  await passo('Relatório de faturamento consolidado exporta CSV', async () => {
    await menu('Relatórios')
    await page.getByLabel('Relatório').selectOption({ label: 'Faturamento consolidado' })
    await page.getByRole('button', { name: 'Gerar relatório' }).click()
    await page.getByRole('cell', { name: 'TOTAL' }).waitFor()
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar CSV' }).click()])
    const caminho = `${OUT}/relatorio.csv`; await dl.saveAs(caminho)
    const csv = fs.readFileSync(caminho, 'utf8')
    if (!csv.includes('TOTAL;335')) throw new Error('CSV sem total esperado: ' + csv)
    await shot('11-relatorios')
  })
  await passo('Configurações: usuários e histórico (proprietário)', async () => {
    await menu('Configurações')
    await page.getByRole('tab', { name: 'Usuários e permissões' }).click()
    await page.getByRole('cell', { name: 'dono@teste.local' }).waitFor()
    await page.getByRole('tab', { name: 'Histórico de alterações' }).click()
    await page.getByRole('cell', { name: 'INSERT' }).first().waitFor()
    await shot('12-configuracoes')
  })
  await passo('Layout responsivo (celular): menu recolhido e tabela utilizável', async () => {
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto(BASE + '/mensalidades')
    await page.getByRole('button', { name: 'Abrir menu' }).waitFor()
    const largura = await page.evaluate(() => document.documentElement.scrollWidth)
    if (largura > 400) throw new Error('rolagem horizontal da página: ' + largura)
    await shot('13-mobile')
  })

  await passo('Sem erros de JavaScript no console', async () => { if (erros.length) throw new Error(erros.slice(0, 3).join(' | ')) })
  await browser.close()
  for (const [s, n] of resultados) console.log(s, '|', n)
  const f = resultados.filter(([s]) => s === 'FALHOU').length
  console.log(`RESUMO E2E: ${resultados.length - f} passaram, ${f} falharam`)
  process.exit(f ? 1 : 0)
})()
