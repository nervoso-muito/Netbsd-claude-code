# $NetBSD$

NCC_VERSION=	0.1.0
DISTNAME=	ncc-${NCC_VERSION}
CATEGORIES=	devel
MASTER_SITES=	# empty — local source
DISTFILES=	# empty

MAINTAINER=	nervoso@k1.com.br
COMMENT=	NetBSD Claude Code - Native Node.js CLI for Claude AI built using claude-code 2.1.66
LICENSE=	modified-bsd

NO_CONFIGURE=	yes
WRKSRC=		${WRKDIR}/ncc

INSTALLATION_DIRS=	bin share/ncc share/ncc/bin share/ncc/src

do-extract:
	${MKDIR} ${WRKSRC}
	${CP} -R ${FILESDIR}/* ${WRKSRC}/

do-build:
	cd ${WRKSRC} && /usr/pkg/bin/npm install --production --no-optional 2>&1

do-install:
	${INSTALL_SCRIPT} ${FILESDIR}/ncc-wrapper.sh ${DESTDIR}${PREFIX}/bin/ncc
	${CP} -R ${WRKSRC}/package.json ${DESTDIR}${PREFIX}/share/ncc/
	${CP} -R ${WRKSRC}/bin ${DESTDIR}${PREFIX}/share/ncc/
	${CP} -R ${WRKSRC}/src ${DESTDIR}${PREFIX}/share/ncc/
	${CP} -R ${WRKSRC}/node_modules ${DESTDIR}${PREFIX}/share/ncc/

.include "../../lang/nodejs/buildlink3.mk"
.include "../../mk/bsd.pkg.mk"
