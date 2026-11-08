import { cpfInputError, classifyContactDbError } from '../src/lib/contactRules.ts';
Deno.test('cpfInputError', () => {
  if (cpfInputError('') !== null || cpfInputError(null) !== null) throw new Error('vazio');
  if (cpfInputError('123') !== 'O CPF deve ter exatamente 11 dígitos.') throw new Error('curto');
  if (cpfInputError('111.111.111-12') !== 'CPF inválido. Confira os dígitos informados.') throw new Error('inválido');
  if (cpfInputError('529.982.247-25') !== null) throw new Error('válido');
});
Deno.test('classifyContactDbError', () => {
  const id = '0b5a3f1e-1111-4222-8333-944455556666';
  const c = classifyContactDbError({ code: '23505', message: `duplicate_cpf:${id}` });
  if (c.kind !== 'duplicate_cpf' || c.contactId !== id) throw new Error('cpf');
  if (classifyContactDbError({ code: '23505', message: 'contacts_org_phone_normalized_key' }).kind !== 'duplicate_phone') throw new Error('phone');
  if (classifyContactDbError({ code: '23505', message: 'contacts_org_email_key' }).kind !== 'duplicate_email') throw new Error('email');
  const o = classifyContactDbError({ code: '42501', message: 'rls' });
  if (o.kind !== 'other' || o.message !== 'rls') throw new Error('other');
});
